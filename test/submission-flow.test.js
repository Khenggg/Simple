import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import app from '../src/server.js';
import { query } from '../src/db.js';
import { config } from '../src/config.js';

test('Submission Flow Integration Tests', async (t) => {
  let server;
  let port;
  let adminId;
  let studentId;
  let studentCookie;

  t.before(async () => {
    // Start temporary test server
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;

    // Get or create a student user
    const { rows: existingStudents } = await query("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1");
    if (existingStudents[0]) {
      studentId = existingStudents[0].id;
    } else {
      const email = `test-student-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
      const { rows: insertedStudent } = await query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ($1, 'dummy_hash', 'Test Student', 'STUDENT')
         RETURNING id`,
        [email]
      );
      studentId = insertedStudent[0].id;
    }

    // Get an existing admin user from DB
    const { rows: existingAdmins } = await query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
    if (!existingAdmins[0]) {
      throw new Error('No admin user found in database. Seed the database first.');
    }
    adminId = existingAdmins[0].id;

    // Generate student cookie
    const token = jwt.sign({ sub: studentId, role: 'STUDENT' }, config.jwtSecret, { expiresIn: '1h' });
    studentCookie = `simpleoj_session=${token}`;
  });

  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // Helper to setup a test problem with testcases and assignment
  async function setupTestProblem({ compareMode, numberTolerance, passingScore, testcases, withAssignment = true }) {
    const slug = `test-flow-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const { rows: probRows } = await query(
      `INSERT INTO problems (slug, title, description, rating, max_score, passing_score, compare_mode, number_tolerance, created_by, is_active)
       VALUES ($1, 'Flow Problem', 'Solve it', 1200, 100, $2, $3, $4, $5, TRUE)
       RETURNING id`,
      [slug, passingScore, compareMode, numberTolerance, adminId]
    );
    const problemId = probRows[0].id;

    for (let i = 0; i < testcases.length; i++) {
      const tc = testcases[i];
      await query(
        `INSERT INTO problem_testcases (problem_id, input, expected_output, is_public, weight, order_index)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [problemId, tc.input, tc.output, tc.isPublic, tc.weight, i]
      );
    }

    if (withAssignment) {
      await query(
        `INSERT INTO student_problem_assignments (user_id, problem_id, status)
         VALUES ($1, $2, 'ASSIGNED')`,
        [studentId, problemId]
      );
    }

    return { slug, problemId };
  }

  async function cleanTestProblem(problemId) {
    await query("DELETE FROM student_problem_assignments WHERE problem_id = $1", [problemId]);
    await query("DELETE FROM user_problem_progress WHERE problem_id = $1", [problemId]);
    await query("DELETE FROM problems WHERE id = $1", [problemId]);
  }

  await t.test('Submit correct student solution scoring 100 and completing assignment', async () => {
    const testcases = [
      { input: '1\n', output: '2\n', isPublic: true, weight: 1 },
      { input: '2\n', output: '4\n', isPublic: false, weight: 3 }
    ];
    const { slug, problemId } = await setupTestProblem({
      compareMode: 'token',
      numberTolerance: 1e-6,
      passingScore: 80,
      testcases
    });

    try {
      // 1. Create attempt
      const attemptRes = await fetch(`http://localhost:${port}/api/attempts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: studentCookie },
        body: JSON.stringify({ slug })
      });
      assert.equal(attemptRes.status, 201);
      const attemptData = await attemptRes.json();
      const attemptId = attemptData.attempt.id;

      // 2. Submit solution
      // Correct solution: read number x, print x * 2
      const code = 'import sys\nx = int(sys.stdin.read().strip())\nprint(x * 2)\n';
      const submitRes = await fetch(`http://localhost:${port}/api/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: studentCookie },
        body: JSON.stringify({ attemptId, code })
      });
      assert.equal(submitRes.status, 201);
      const submitData = await submitRes.json();

      // Assert submission details
      assert.equal(submitData.submission.score, 100);
      assert.equal(submitData.submission.status, 'ACCEPTED');

      // Assert report values and masking
      const reports = submitData.reports;
      assert.equal(reports.length, 2);
      
      // Public testcase: input/output visible
      assert.equal(reports[0].passed, true);
      assert.equal(reports[0].input, '1\n');
      assert.equal(reports[0].expected, '2\n');
      assert.equal(reports[0].actual, '2\n');

      // Private testcase: input/output masked
      assert.equal(reports[1].passed, true);
      assert.equal(reports[1].input, undefined);
      assert.equal(reports[1].expected, undefined);
      assert.equal(reports[1].actual, undefined);

      // Verify progress updated & completed
      const progress = await query("SELECT completed_at, best_score FROM user_problem_progress WHERE user_id=$1 AND problem_id=$2", [studentId, problemId]);
      assert.equal(progress.rows[0].best_score, 100);
      assert.ok(progress.rows[0].completed_at !== null);

      // Verify assignment completed
      const assignment = await query("SELECT status FROM student_problem_assignments WHERE user_id=$1 AND problem_id=$2", [studentId, problemId]);
      assert.equal(assignment.rows[0].status, 'COMPLETED');
    } finally {
      await cleanTestProblem(problemId);
    }
  });

  await t.test('Submit partial solution, verifying weight score calculation and assignment status', async () => {
    // 2 testcases with weights: TC1 (weight 1), TC2 (weight 3) -> TC1 is 25%, TC2 is 75%
    const testcases = [
      { input: '1\n', output: '2\n', isPublic: true, weight: 1 },
      { input: '2\n', output: '4\n', isPublic: false, weight: 3 }
    ];
    const { slug, problemId } = await setupTestProblem({
      compareMode: 'token',
      numberTolerance: 1e-6,
      passingScore: 80,
      testcases
    });

    try {
      // 1. Create attempt
      const attemptRes = await fetch(`http://localhost:${port}/api/attempts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: studentCookie },
        body: JSON.stringify({ slug })
      });
      const attemptData = await attemptRes.json();
      const attemptId = attemptData.attempt.id;

      // 2. Submit solution that only passes TC1: prints 2 for any input
      const code = 'print(2)\n';
      const submitRes = await fetch(`http://localhost:${port}/api/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: studentCookie },
        body: JSON.stringify({ attemptId, code })
      });
      assert.equal(submitRes.status, 201);
      const submitData = await submitRes.json();

      // Assert weight scoring: 1/4 -> 25% -> 25 score
      assert.equal(submitData.submission.score, 25);
      assert.equal(submitData.submission.status, 'WRONG_ANSWER');

      // Assert report values and masking for wrong private testcase
      const reports = submitData.reports;
      assert.equal(reports.length, 2);

      // TC1 (Public, Passed)
      assert.equal(reports[0].passed, true);
      assert.equal(reports[0].input, '1\n');
      assert.equal(reports[0].expected, '2\n');
      assert.equal(reports[0].actual, '2\n');

      // TC2 (Private, Failed)
      assert.equal(reports[1].passed, false);
      assert.equal(reports[1].input, undefined);
      assert.equal(reports[1].expected, undefined);
      assert.equal(reports[1].actual, undefined);

      // Since passingScore is 80 and score is 25, the assignment must NOT be completed
      const assignment = await query("SELECT status FROM student_problem_assignments WHERE user_id=$1 AND problem_id=$2", [studentId, problemId]);
      assert.equal(assignment.rows[0].status, 'ASSIGNED');

      const progress = await query("SELECT completed_at FROM user_problem_progress WHERE user_id=$1 AND problem_id=$2", [studentId, problemId]);
      assert.equal(progress.rows[0].completed_at, null);
    } finally {
      await cleanTestProblem(problemId);
    }
  });

  await t.test('Submit partial solution achieving passing_score completes assignment', async () => {
    // 2 testcases with weights: TC1 (weight 1), TC2 (weight 3) -> TC2 is 75%
    const testcases = [
      { input: '1\n', output: '2\n', isPublic: true, weight: 1 },
      { input: '2\n', output: '4\n', isPublic: false, weight: 3 }
    ];
    // Passing score is 70
    const { slug, problemId } = await setupTestProblem({
      compareMode: 'token',
      numberTolerance: 1e-6,
      passingScore: 70,
      testcases
    });

    try {
      // 1. Create attempt
      const attemptRes = await fetch(`http://localhost:${port}/api/attempts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: studentCookie },
        body: JSON.stringify({ slug })
      });
      const attemptData = await attemptRes.json();
      const attemptId = attemptData.attempt.id;

      // 2. Submit solution that only passes TC2: prints 4 for any input
      const code = 'print(4)\n';
      const submitRes = await fetch(`http://localhost:${port}/api/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: studentCookie },
        body: JSON.stringify({ attemptId, code })
      });
      assert.equal(submitRes.status, 201);
      const submitData = await submitRes.json();

      // Assert weight scoring: 3/4 -> 75% -> 75 score
      assert.equal(submitData.submission.score, 75);

      // Since passingScore is 70 and score is 75 (score >= passingScore), the assignment MUST be COMPLETED
      const assignment = await query("SELECT status FROM student_problem_assignments WHERE user_id=$1 AND problem_id=$2", [studentId, problemId]);
      assert.equal(assignment.rows[0].status, 'COMPLETED');

      const progress = await query("SELECT completed_at FROM user_problem_progress WHERE user_id=$1 AND problem_id=$2", [studentId, problemId]);
      assert.ok(progress.rows[0].completed_at !== null);
    } finally {
      await cleanTestProblem(problemId);
    }
  });

  await t.test('Verify that /api/health returns correct and safe health diagnostics', async () => {
    const res = await fetch(`http://localhost:${port}/api/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.database, true);
    assert.equal(data.migrations, true);
    assert.equal(data.runner, true);
    assert.equal(data.python, true);
    assert.equal(data.judge, 'local');
    assert.equal(data.jwtSecret, undefined);
    assert.equal(data.databaseUrl, undefined);
  });
});
