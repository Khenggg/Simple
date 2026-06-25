import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import app from '../src/server.js';
import { query } from '../src/db.js';
import { config } from '../src/config.js';

test('Admin Submission Review APIs', async (t) => {
  let server;
  let port;
  let adminId;
  let studentId;
  let otherStudentId;
  let adminCookie;
  let studentCookie;
  let otherStudentCookie;
  const createdUserIds = [];

  async function ensureUser(role, label) {
    const { rows } = await query(`SELECT id FROM users WHERE role = $1 LIMIT 1`, [role]);
    if (rows[0]) return rows[0].id;

    const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const inserted = await query(
      `INSERT INTO users (email, password_hash, full_name, role, is_active)
       VALUES ($1, 'dummy_hash', $2, $3, TRUE)
       RETURNING id`,
      [email, label, role]
    );
    return inserted.rows[0].id;
  }

  async function createTempUser(role, label) {
    const email = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const inserted = await query(
      `INSERT INTO users (email, password_hash, full_name, role, is_active)
       VALUES ($1, 'dummy_hash', $2, $3, TRUE)
       RETURNING id`,
      [email, label, role]
    );
    createdUserIds.push(inserted.rows[0].id);
    return inserted.rows[0].id;
  }

  async function createProblem() {
    const slug = `admin-sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await query(
      `INSERT INTO problems (slug, title, description, rating, created_by)
       VALUES ($1, $2, 'Submission review test', 900, $3)
       RETURNING id, slug, title`,
      [slug, `Problem ${slug}`, adminId]
    );
    return result.rows[0];
  }

  async function createSubmission({
    userId,
    problemId,
    status = 'WRONG_ANSWER',
    score = 60,
    code = 'print("hello")\n',
    passedCount = 3,
    totalCount = 5,
    durationMs = 321,
    report = [
      { index: 1, status: 'ACCEPTED', passed: true, input: '1\n', expected: '2\n', actual: '2\n', runtimeMs: 11 },
      { index: 2, status: 'WRONG_ANSWER', passed: false, input: '2\n', expected: '4\n', actual: '5\n', runtimeMs: 14 }
    ]
  }) {
    const result = await query(
      `INSERT INTO submissions (problem_id, user_id, code, status, score, passed_count, total_count, duration_ms, report)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING id`,
      [problemId, userId, code, status, score, passedCount, totalCount, durationMs, JSON.stringify(report)]
    );
    return result.rows[0].id;
  }

  async function cleanupProblem(problemId) {
    await query('DELETE FROM submissions WHERE problem_id = $1', [problemId]);
    await query('DELETE FROM problems WHERE id = $1', [problemId]);
  }

  t.before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;

    adminId = await ensureUser('ADMIN', 'Admin Review');
    studentId = await createTempUser('STUDENT', 'Student Review');
    otherStudentId = await createTempUser('STUDENT', 'Other Student Review');

    adminCookie = `simpleoj_session=${jwt.sign({ sub: adminId, role: 'ADMIN' }, config.jwtSecret, { expiresIn: '1h' })}`;
    studentCookie = `simpleoj_session=${jwt.sign({ sub: studentId, role: 'STUDENT' }, config.jwtSecret, { expiresIn: '1h' })}`;
    otherStudentCookie = `simpleoj_session=${jwt.sign({ sub: otherStudentId, role: 'STUDENT' }, config.jwtSecret, { expiresIn: '1h' })}`;
  });

  t.after(async () => {
    for (const userId of createdUserIds) {
      await query('DELETE FROM users WHERE id = $1', [userId]);
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('student cannot list admin submissions', async () => {
    const response = await fetch(`http://localhost:${port}/api/admin/submissions`, {
      headers: { cookie: studentCookie }
    });
    assert.equal(response.status, 403);
  });

  await t.test('admin can list submissions without code', async () => {
    const problem = await createProblem();
    try {
      const submissionId = await createSubmission({ userId: studentId, problemId: problem.id, score: 88, status: 'ACCEPTED' });
      const response = await fetch(`http://localhost:${port}/api/admin/submissions?problemSlug=${problem.slug}`, {
        headers: { cookie: adminCookie }
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      const found = body.submissions.find((item) => item.id === submissionId);
      assert.ok(found);
      assert.equal(found.studentId, studentId);
      assert.equal(found.problemSlug, problem.slug);
      assert.equal(found.code, undefined);
      assert.ok(body.pagination);
    } finally {
      await cleanupProblem(problem.id);
    }
  });

  await t.test('admin can view submission detail with code and report', async () => {
    const problem = await createProblem();
    try {
      const submissionId = await createSubmission({ userId: studentId, problemId: problem.id });
      const response = await fetch(`http://localhost:${port}/api/admin/submissions/${submissionId}`, {
        headers: { cookie: adminCookie }
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.submission.id, submissionId);
      assert.equal(body.submission.studentEmail.includes('@example.com'), true);
      assert.ok(body.submission.code.includes('print'));
      assert.ok(Array.isArray(body.submission.report));
      assert.equal(body.submission.firstFailedReport.status, 'WRONG_ANSWER');
    } finally {
      await cleanupProblem(problem.id);
    }
  });

  await t.test('filters by status and problem slug', async () => {
    const problemA = await createProblem();
    const problemB = await createProblem();
    try {
      const wrongId = await createSubmission({ userId: studentId, problemId: problemA.id, status: 'WRONG_ANSWER', score: 25 });
      await createSubmission({ userId: studentId, problemId: problemA.id, status: 'ACCEPTED', score: 100 });
      await createSubmission({ userId: studentId, problemId: problemB.id, status: 'WRONG_ANSWER', score: 40 });

      const statusResponse = await fetch(`http://localhost:${port}/api/admin/submissions?status=WRONG_ANSWER&problemSlug=${problemA.slug}`, {
        headers: { cookie: adminCookie }
      });
      assert.equal(statusResponse.status, 200);
      const body = await statusResponse.json();
      assert.ok(body.submissions.length >= 1);
      assert.ok(body.submissions.every((item) => item.status === 'WRONG_ANSWER'));
      assert.ok(body.submissions.every((item) => item.problemSlug === problemA.slug));
      assert.ok(body.submissions.some((item) => item.id === wrongId));
    } finally {
      await cleanupProblem(problemA.id);
      await cleanupProblem(problemB.id);
    }
  });

  await t.test('search by student email and problem title', async () => {
    const problem = await createProblem();
    try {
      const submissionId = await createSubmission({ userId: studentId, problemId: problem.id, status: 'RUNTIME_ERROR', score: 0 });

      const byEmail = await fetch(`http://localhost:${port}/api/admin/submissions?q=${encodeURIComponent('student-review')}`, {
        headers: { cookie: adminCookie }
      });
      assert.equal(byEmail.status, 200);
      const emailBody = await byEmail.json();
      assert.ok(emailBody.submissions.some((item) => item.id === submissionId));

      const byTitle = await fetch(`http://localhost:${port}/api/admin/submissions?q=${encodeURIComponent(problem.title)}`, {
        headers: { cookie: adminCookie }
      });
      assert.equal(byTitle.status, 200);
      const titleBody = await byTitle.json();
      assert.ok(titleBody.submissions.some((item) => item.id === submissionId));
    } finally {
      await cleanupProblem(problem.id);
    }
  });

  await t.test('paginates and ignores invalid status filter', async () => {
    const problem = await createProblem();
    try {
      for (let index = 0; index < 25; index += 1) {
        await createSubmission({
          userId: studentId,
          problemId: problem.id,
          status: index % 2 === 0 ? 'ACCEPTED' : 'WRONG_ANSWER',
          score: index % 2 === 0 ? 100 : 50,
          code: `print(${index})\n`
        });
      }

      const paged = await fetch(`http://localhost:${port}/api/admin/submissions?problemSlug=${problem.slug}&page=1&pageSize=10`, {
        headers: { cookie: adminCookie }
      });
      assert.equal(paged.status, 200);
      const pagedBody = await paged.json();
      assert.equal(pagedBody.submissions.length, 10);
      assert.ok(pagedBody.pagination.total >= 25);
      assert.ok(pagedBody.pagination.totalPages >= 3);

      const invalidStatus = await fetch(`http://localhost:${port}/api/admin/submissions?problemSlug=${problem.slug}&status=NOT_A_REAL_STATUS`, {
        headers: { cookie: adminCookie }
      });
      assert.equal(invalidStatus.status, 200);
      const invalidBody = await invalidStatus.json();
      assert.ok(invalidBody.submissions.length > 0);
    } finally {
      await cleanupProblem(problem.id);
    }
  });

  await t.test('detail returns 404 for missing submission', async () => {
    const response = await fetch(`http://localhost:${port}/api/admin/submissions/00000000-0000-0000-0000-000000000000`, {
      headers: { cookie: adminCookie }
    });
    assert.equal(response.status, 404);
  });

  await t.test('existing student submission detail permissions still hold', async () => {
    const problem = await createProblem();
    try {
      const submissionId = await createSubmission({ userId: studentId, problemId: problem.id, status: 'ACCEPTED', score: 100 });

      const ownerRes = await fetch(`http://localhost:${port}/api/submissions/${submissionId}`, {
        headers: { cookie: studentCookie }
      });
      assert.equal(ownerRes.status, 200);

      const otherRes = await fetch(`http://localhost:${port}/api/submissions/${submissionId}`, {
        headers: { cookie: otherStudentCookie }
      });
      assert.equal(otherRes.status, 403);

      const adminRes = await fetch(`http://localhost:${port}/api/submissions/${submissionId}`, {
        headers: { cookie: adminCookie }
      });
      assert.equal(adminRes.status, 200);
    } finally {
      await cleanupProblem(problem.id);
    }
  });
});
