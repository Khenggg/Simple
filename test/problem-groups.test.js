import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import app from '../src/server.js';
import { query } from '../src/db.js';
import { config } from '../src/config.js';

test('Problem Groups Integration Tests', async (t) => {
  let server;
  let port;
  let adminId;
  let adminCookie;
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
      const email = `test-group-student-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
      const { rows: insertedStudent } = await query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ($1, 'dummy_hash', 'Test Group Student', 'STUDENT')
         RETURNING id`,
        [email]
      );
      studentId = insertedStudent[0].id;
    }

    // Get an existing admin user from DB
    const { rows: existingAdmins } = await query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
    if (existingAdmins[0]) {
      adminId = existingAdmins[0].id;
    } else {
      const email = `test-group-admin-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
      const { rows: insertedAdmin } = await query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ($1, 'dummy_hash', 'Test Group Admin', 'ADMIN')
         RETURNING id`,
        [email]
      );
      adminId = insertedAdmin[0].id;
    }

    // Generate cookies
    const studentToken = jwt.sign({ sub: studentId, role: 'STUDENT' }, config.jwtSecret, { expiresIn: '1h' });
    studentCookie = `simpleoj_session=${studentToken}`;

    const adminToken = jwt.sign({ sub: adminId, role: 'ADMIN' }, config.jwtSecret, { expiresIn: '1h' });
    adminCookie = `simpleoj_session=${adminToken}`;
  });

  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  async function createTestProblem(slug) {
    const { rows } = await query(
      `INSERT INTO problems (slug, title, description, rating, max_score, passing_score, created_by, is_active)
       VALUES ($1, 'Group Test Problem', 'Description', 800, 100, 100, $2, TRUE) RETURNING id`,
      [slug, adminId]
    );
    return rows[0].id;
  }

  await t.test('Admin can create group with at least one problem, student cannot', async () => {
    const slug = `p-g-${Date.now()}`;
    const pid = await createTestProblem(slug);

    // Student tries to create -> 403
    const resStud = await fetch(`http://localhost:${port}/api/admin/problem-groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: studentCookie },
      body: JSON.stringify({
        name: 'Nhóm Student Test',
        slug: `stud-test-${Date.now()}`,
        problemIds: [pid]
      })
    });
    assert.equal(resStud.status, 403);

    // Admin tries to create empty group -> 400
    const resEmpty = await fetch(`http://localhost:${port}/api/admin/problem-groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        name: 'Nhóm Trống',
        slug: `empty-test-${Date.now()}`,
        problemIds: []
      })
    });
    assert.equal(resEmpty.status, 400);

    // Admin creates successfully
    const groupSlug = `success-${Date.now()}`;
    const resSuccess = await fetch(`http://localhost:${port}/api/admin/problem-groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        name: 'Nhóm Thành Công',
        slug: groupSlug,
        problemIds: [pid]
      })
    });
    assert.equal(resSuccess.status, 201);
    const data = await resSuccess.json();
    assert.equal(data.group.name, 'Nhóm Thành Công');
    assert.deepEqual(data.group.problemIds, [pid]);

    // Clean up
    await query("DELETE FROM problem_groups WHERE id = $1", [data.group.id]);
    await query("DELETE FROM problems WHERE id = $1", [pid]);
  });

  await t.test('Group update and orphan rules', async () => {
    const pid1 = await createTestProblem(`p1-${Date.now()}`);
    const pid2 = await createTestProblem(`p2-${Date.now()}`);

    // Create Group A containing pid1
    const resA = await fetch(`http://localhost:${port}/api/admin/problem-groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        name: 'Nhóm A',
        slug: `group-a-${Date.now()}`,
        problemIds: [pid1]
      })
    });
    const groupA = (await resA.json()).group;

    // Create Group B containing pid2
    const resB = await fetch(`http://localhost:${port}/api/admin/problem-groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        name: 'Nhóm B',
        slug: `group-b-${Date.now()}`,
        problemIds: [pid2]
      })
    });
    const groupB = (await resB.json()).group;

    // 1. Try to update Group A to have empty problemIds -> should fail
    const resUpdEmpty = await fetch(`http://localhost:${port}/api/admin/problem-groups/${groupA.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        name: 'Nhóm A mới',
        problemIds: []
      })
    });
    assert.equal(resUpdEmpty.status, 400);

    // 2. Try to remove pid1 from Group A (which makes pid1 orphan since it is in no other active groups) -> should fail
    const resUpdOrphan = await fetch(`http://localhost:${port}/api/admin/problem-groups/${groupA.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        name: 'Nhóm A mới',
        problemIds: [pid2] // removes pid1, adds pid2
      })
    });
    assert.equal(resUpdOrphan.status, 400);

    // 3. Add pid1 to Group B first (so pid1 belongs to two groups)
    const resUpdB = await fetch(`http://localhost:${port}/api/admin/problem-groups/${groupB.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        name: 'Nhóm B',
        problemIds: [pid2, pid1]
      })
    });
    assert.equal(resUpdB.status, 200);

    // Now remove pid1 from Group A -> should succeed because pid1 still belongs to Group B!
    const resUpdAOk = await fetch(`http://localhost:${port}/api/admin/problem-groups/${groupA.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        name: 'Nhóm A mới',
        problemIds: [pid2] // pid1 removed, pid2 added
      })
    });
    assert.equal(resUpdAOk.status, 200);

    // Clean up
    await query("DELETE FROM problem_groups WHERE id IN ($1, $2)", [groupA.id, groupB.id]);
    await query("DELETE FROM problems WHERE id IN ($1, $2)", [pid1, pid2]);
  });

  await t.test('Deactivate / delete group checks', async () => {
    const pid = await createTestProblem(`p-del-${Date.now()}`);

    // Create Group
    const resG = await fetch(`http://localhost:${port}/api/admin/problem-groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        name: 'Nhóm Xóa',
        slug: `group-del-${Date.now()}`,
        problemIds: [pid]
      })
    });
    const group = (await resG.json()).group;

    // Try to delete/deactivate Group -> should fail since it would orphan pid
    const resDel = await fetch(`http://localhost:${port}/api/admin/problem-groups/${group.id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', cookie: adminCookie }
    });
    assert.equal(resDel.status, 400);

    // Create a target group for moving problems
    const resT = await fetch(`http://localhost:${port}/api/admin/problem-groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        name: 'Nhóm Đích',
        slug: `group-target-${Date.now()}`,
        problemIds: [pid] // starts with same problem
      })
    });
    const targetGroup = (await resT.json()).group;

    // Try deleting with moveToGroupId -> should succeed
    const resDelSuccess = await fetch(`http://localhost:${port}/api/admin/problem-groups/${group.id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ moveToGroupId: targetGroup.id })
    });
    assert.equal(resDelSuccess.status, 200);

    // Clean up
    await query("DELETE FROM problem_groups WHERE id IN ($1, $2)", [group.id, targetGroup.id]);
    await query("DELETE FROM problems WHERE id = $1", [pid]);
  });

  await t.test('Problem imports require group assignment', async () => {
    const importPayload = [
      {
        slug: `imp-${Date.now()}`,
        title: 'Import Problem',
        description: 'Solve this import',
        rating: 1000,
        passingScore: 100,
        maxScore: 100,
        testcases: [{ input: '1\n', output: '1\n', isPublic: true, weight: 1 }]
      }
    ];

    // 1. Import without any groupIds -> should fail with 400
    const resFail = await fetch(`http://localhost:${port}/api/admin/problems/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        problems: importPayload,
        groupIds: []
      })
    });
    assert.equal(resFail.status, 400);

    // 2. Import with invalid group ID -> should fail with 400
    const resFailInvalid = await fetch(`http://localhost:${port}/api/admin/problems/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        problems: importPayload,
        groupIds: ['00000000-0000-0000-0000-000000000000']
      })
    });
    assert.equal(resFailInvalid.status, 400);

    // 3. Find default group id
    const { rows } = await query("SELECT id FROM problem_groups WHERE slug = 'bai-tap-co-ban' AND is_active = TRUE");
    assert.ok(rows[0]);
    const defaultGroupId = rows[0].id;

    // 4. Import with correct group ID -> should succeed
    const resSuccess = await fetch(`http://localhost:${port}/api/admin/problems/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        problems: importPayload,
        groupIds: [defaultGroupId]
      })
    });
    assert.equal(resSuccess.status, 200);
    const data = await resSuccess.json();
    assert.equal(data.imported, 1);

    // Clean up
    await query("DELETE FROM problem_group_items WHERE problem_id IN (SELECT id FROM problems WHERE slug = $1)", [importPayload[0].slug]);
    await query("DELETE FROM problems WHERE slug = $1", [importPayload[0].slug]);
  });
});
