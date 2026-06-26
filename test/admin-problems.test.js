import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import app from '../src/server.js';
import { query } from '../src/db.js';
import { config } from '../src/config.js';
import { assertLocalTestDatabase } from './test-db-guard.js';

assertLocalTestDatabase('admin-problems.test.js');

test('Admin problem visibility and hard delete', async (t) => {
  let server;
  let port;
  let adminId;
  let studentId;
  let adminCookie;
  let studentCookie;
  const createdUserIds = [];
  const createdProblemIds = [];

  async function createTempUser(role, label) {
    const email = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, full_name, role, is_active)
       VALUES ($1, 'dummy_hash', $2, $3, TRUE)
       RETURNING id`,
      [email, label, role]
    );
    createdUserIds.push(rows[0].id);
    return rows[0].id;
  }

  async function createProblem(prefix) {
    const slug = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { rows } = await query(
      `INSERT INTO problems (slug, title, description, rating, max_score, passing_score, created_by, is_active)
       VALUES ($1, $2, 'Admin visibility test', 900, 100, 100, $3, TRUE)
       RETURNING id, slug`,
      [slug, `Problem ${slug}`, adminId]
    );
    const problemId = rows[0].id;
    createdProblemIds.push(problemId);
    const { rows: groupRows } = await query("SELECT id FROM problem_groups WHERE slug = 'bai-tap-co-ban' AND is_active = TRUE LIMIT 1");
    await query('INSERT INTO problem_group_items (group_id, problem_id, added_by) VALUES ($1, $2, $3)', [groupRows[0].id, problemId, adminId]);
    await query(
      `INSERT INTO problem_testcases (problem_id, input, expected_output, is_public, weight, order_index)
       VALUES ($1, '1\n', '2\n', TRUE, 1, 0)`,
      [problemId]
    );
    return rows[0];
  }

  t.before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;

    const { rows: admins } = await query("SELECT id FROM users WHERE role = 'ADMIN' AND is_active = TRUE ORDER BY created_at LIMIT 1");
    adminId = admins[0]?.id || await createTempUser('ADMIN', 'Admin Problems');
    studentId = await createTempUser('STUDENT', 'Student Problems');

    adminCookie = `simpleoj_session=${jwt.sign({ sub: adminId, role: 'ADMIN' }, config.jwtSecret, { expiresIn: '1h' })}`;
    studentCookie = `simpleoj_session=${jwt.sign({ sub: studentId, role: 'STUDENT' }, config.jwtSecret, { expiresIn: '1h' })}`;
  });

  t.after(async () => {
    for (const problemId of createdProblemIds) {
      await query('DELETE FROM submissions WHERE problem_id = $1', [problemId]);
      await query('DELETE FROM problem_testcases WHERE problem_id = $1', [problemId]);
      await query('DELETE FROM problem_group_items WHERE problem_id = $1', [problemId]);
      await query('DELETE FROM problems WHERE id = $1', [problemId]);
    }
    for (const userId of createdUserIds) {
      await query('DELETE FROM users WHERE id = $1', [userId]);
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('Hidden problems stay visible to admin but not students', async () => {
    const problem = await createProblem('admin-problem-visibility');

    const hideRes = await fetch(`http://localhost:${port}/api/admin/problems/${problem.id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ isActive: false })
    });
    assert.equal(hideRes.status, 200);

    const studentRes = await fetch(`http://localhost:${port}/api/problems`, { headers: { cookie: studentCookie } });
    const studentBody = await studentRes.json();
    assert.ok(!studentBody.problems.some((item) => item.slug === problem.slug));

    const adminRes = await fetch(`http://localhost:${port}/api/problems`, { headers: { cookie: adminCookie } });
    const adminBody = await adminRes.json();
    assert.ok(adminBody.problems.some((item) => item.slug === problem.slug));

    const restoreRes = await fetch(`http://localhost:${port}/api/admin/problems/${problem.id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ isActive: true })
    });
    assert.equal(restoreRes.status, 200);

    const restoredStudentRes = await fetch(`http://localhost:${port}/api/problems`, { headers: { cookie: studentCookie } });
    const restoredStudentBody = await restoredStudentRes.json();
    assert.ok(restoredStudentBody.problems.some((item) => item.slug === problem.slug));
  });

  await t.test('Hard delete removes related rows', async () => {
    const problem = await createProblem('admin-problem-hard-delete');
    await query(
      `INSERT INTO submissions (problem_id, user_id, code, status, score, passed_count, total_count, duration_ms, report)
       VALUES ($1, $2, 'print(1)', 'WRONG_ANSWER', 0, 0, 1, 12, '[]'::jsonb)`,
      [problem.id, studentId]
    );

    const deleteRes = await fetch(`http://localhost:${port}/api/admin/problems/${problem.id}?hard=true`, {
      method: 'DELETE',
      headers: { cookie: adminCookie }
    });
    assert.equal(deleteRes.status, 200);

    const { rows: problemRows } = await query('SELECT id FROM problems WHERE id = $1', [problem.id]);
    const { rows: submissionRows } = await query('SELECT id FROM submissions WHERE problem_id = $1', [problem.id]);
    const { rows: testcaseRows } = await query('SELECT id FROM problem_testcases WHERE problem_id = $1', [problem.id]);
    const { rows: groupRows } = await query('SELECT id FROM problem_group_items WHERE problem_id = $1', [problem.id]);
    assert.equal(problemRows.length, 0);
    assert.equal(submissionRows.length, 0);
    assert.equal(testcaseRows.length, 0);
    assert.equal(groupRows.length, 0);
  });
});
