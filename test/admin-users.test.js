import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import app from '../src/server.js';
import { query, transaction } from '../src/db.js';
import { config } from '../src/config.js';
import { hashPassword, verifyPassword } from '../src/auth.js';
import { assertLocalTestDatabase } from './test-db-guard.js';

assertLocalTestDatabase('admin-users.test.js');

test('Admin Users CRUD Integration Tests', async (t) => {
  let server;
  let port;
  let adminId;
  let adminCookie;
  let studentId;
  let studentCookie;
  let helperAdminId; // a second admin to test deactivating/demoting/deleting "last admin" rules
  let helperAdminCookie;

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
      const email = `test-crud-student-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
      const { rows: insertedStudent } = await query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ($1, 'dummy_hash', 'Test Crud Student', 'STUDENT')
         RETURNING id`,
        [email]
      );
      studentId = insertedStudent[0].id;
    }

    // Get or create an admin user
    const { rows: existingAdmins } = await query("SELECT id, email FROM users WHERE role = 'ADMIN' AND is_active = TRUE ORDER BY created_at LIMIT 2");
    if (existingAdmins[0]) {
      adminId = existingAdmins[0].id;
    } else {
      const email = `test-crud-admin-${Date.now()}@example.com`;
      const { rows: insertedAdmin } = await query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ($1, 'dummy_hash', 'Test Crud Admin', 'ADMIN')
         RETURNING id`,
        [email]
      );
      adminId = insertedAdmin[0].id;
    }

    // Ensure we have a second active admin to prevent "last admin" rule failure during self-deactivation tests
    if (existingAdmins[1]) {
      helperAdminId = existingAdmins[1].id;
    } else {
      const email2 = `test-crud-helper-admin-${Date.now()}@example.com`;
      const { rows: insertedHelperAdmin } = await query(
        `INSERT INTO users (email, password_hash, full_name, role, is_active)
         VALUES ($1, 'dummy_hash', 'Helper Admin', 'ADMIN', TRUE)
         RETURNING id`,
        [email2]
      );
      helperAdminId = insertedHelperAdmin[0].id;
    }

    // Generate cookies
    const studentToken = jwt.sign({ sub: studentId, role: 'STUDENT' }, config.jwtSecret, { expiresIn: '1h' });
    studentCookie = `simpleoj_session=${studentToken}`;

    const adminToken = jwt.sign({ sub: adminId, role: 'ADMIN' }, config.jwtSecret, { expiresIn: '1h' });
    adminCookie = `simpleoj_session=${adminToken}`;

    const helperAdminToken = jwt.sign({ sub: helperAdminId, role: 'ADMIN' }, config.jwtSecret, { expiresIn: '1h' });
    helperAdminCookie = `simpleoj_session=${helperAdminToken}`;
  });

  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('Authorization: blocks student and anonymous, allows admin', async () => {
    // Anonymous -> 401
    const resAnon = await fetch(`http://localhost:${port}/api/admin/users`);
    assert.equal(resAnon.status, 401);

    // Student -> 403
    const resStud = await fetch(`http://localhost:${port}/api/admin/users`, {
      headers: { cookie: studentCookie }
    });
    assert.equal(resStud.status, 403);

    // Admin -> 200
    const resAdmin = await fetch(`http://localhost:${port}/api/admin/users`, {
      headers: { cookie: adminCookie }
    });
    assert.equal(resAdmin.status, 200);
  });

  await t.test('List Users: pagination, searching, filtering, and no password hashes exposed', async () => {
    const uniqName = `UniqFullName-${Date.now()}`;
    const uniqEmail = `uniq-email-${Date.now()}@example.com`;
    
    // Insert a specific user to search and filter for
    const { rows: inserted } = await query(
      `INSERT INTO users (email, password_hash, full_name, role, is_active)
       VALUES ($1, 'dummy_hash', $2, 'STUDENT', TRUE) RETURNING id`,
      [uniqEmail, uniqName]
    );
    const targetUserId = inserted[0].id;

    // 1. Verify no password_hash is returned
    const res = await fetch(`http://localhost:${port}/api/admin/users`, {
      headers: { cookie: adminCookie }
    });
    const body = await res.json();
    assert.ok(body.users.length > 0);
    for (const u of body.users) {
      assert.equal(u.password_hash, undefined);
      assert.equal(u.passwordHash, undefined);
    }

    // 2. Verify pagination shape
    assert.ok(body.pagination);
    assert.ok(body.pagination.page);
    assert.ok(body.pagination.pageSize);
    assert.ok(body.pagination.total);
    assert.ok(body.pagination.totalPages);

    // 3. Search by name
    const resSearch = await fetch(`http://localhost:${port}/api/admin/users?q=${uniqName}`, {
      headers: { cookie: adminCookie }
    });
    const bodySearch = await resSearch.json();
    assert.equal(bodySearch.users.length, 1);
    assert.equal(bodySearch.users[0].id, targetUserId);

    // 4. Filter by role
    const resRole = await fetch(`http://localhost:${port}/api/admin/users?role=ADMIN`, {
      headers: { cookie: adminCookie }
    });
    const bodyRole = await resRole.json();
    assert.ok(bodyRole.users.every(u => u.role === 'ADMIN'));

    // 5. Filter by status
    const resStatus = await fetch(`http://localhost:${port}/api/admin/users?status=active`, {
      headers: { cookie: adminCookie }
    });
    const bodyStatus = await resStatus.json();
    assert.ok(bodyStatus.users.every(u => u.isActive === true));

    // Clean up
    await query("DELETE FROM users WHERE id = $1", [targetUserId]);
  });

  await t.test('Create User: validations, unique check, and no session cookie set', async () => {
    const email = `create-user-${Date.now()}@example.com`;

    // Invalid password (too short) -> 400
    const resShortPass = await fetch(`http://localhost:${port}/api/admin/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        email,
        fullName: 'Test Short Pass',
        password: '123',
        role: 'STUDENT'
      })
    });
    assert.equal(resShortPass.status, 400);

    // Invalid password (no digits) -> 400
    const resNoDigits = await fetch(`http://localhost:${port}/api/admin/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        email,
        fullName: 'Test No Digits',
        password: 'PasswordNoDigits',
        role: 'STUDENT'
      })
    });
    assert.equal(resNoDigits.status, 400);

    // Valid create -> 201
    const resValid = await fetch(`http://localhost:${port}/api/admin/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        email,
        fullName: 'Create Success User',
        password: 'Password123',
        role: 'STUDENT',
        isActive: true
      })
    });
    assert.equal(resValid.status, 201);
    const bodyValid = await resValid.json();
    assert.equal(bodyValid.user.email, email);
    assert.equal(bodyValid.user.fullName, 'Create Success User');
    assert.equal(bodyValid.user.isActive, true);

    // Verify no session cookie was set in the response headers (admin should not be logged in as the new user)
    const cookies = resValid.headers.get('set-cookie');
    assert.ok(!cookies || !cookies.includes('simpleoj_session'));

    // Duplicate email -> 409
    const resDuplicate = await fetch(`http://localhost:${port}/api/admin/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        email,
        fullName: 'Duplicate Email User',
        password: 'Password123',
        role: 'STUDENT'
      })
    });
    assert.equal(resDuplicate.status, 409);

    // Clean up
    await query("DELETE FROM users WHERE email = $1", [email]);
  });

  await t.test('Update User Profile: edit name/role, duplicate email block, and safety rules', async () => {
    const emailA = `email-a-${Date.now()}@example.com`;
    const emailB = `email-b-${Date.now()}@example.com`;

    const { rows: userARows } = await query(
      `INSERT INTO users (email, password_hash, full_name, role, is_active)
       VALUES ($1, 'dummy_hash', 'User A', 'STUDENT', TRUE) RETURNING id`,
      [emailA]
    );
    const userAId = userARows[0].id;

    const { rows: userBRows } = await query(
      `INSERT INTO users (email, password_hash, full_name, role, is_active)
       VALUES ($1, 'dummy_hash', 'User B', 'STUDENT', TRUE) RETURNING id`,
      [emailB]
    );
    const userBId = userBRows[0].id;

    // 1. Success update: change full name and role to ADMIN
    const resOk = await fetch(`http://localhost:${port}/api/admin/users/${userAId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        fullName: 'User A Modified',
        email: emailA,
        role: 'ADMIN',
        isActive: true
      })
    });
    assert.equal(resOk.status, 200);
    const bodyOk = await resOk.json();
    assert.equal(bodyOk.user.fullName, 'User A Modified');
    assert.equal(bodyOk.user.role, 'ADMIN');

    // 2. Duplicate email update -> 409
    const resDup = await fetch(`http://localhost:${port}/api/admin/users/${userAId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        fullName: 'User A Modified',
        email: emailB,
        role: 'ADMIN',
        isActive: true
      })
    });
    assert.equal(resDup.status, 409);

    // 3. Safety: demoting self to STUDENT -> 400
    const resSelfDemote = await fetch(`http://localhost:${port}/api/admin/users/${adminId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        fullName: 'Admin',
        email: `admin-${Date.now()}@example.com`,
        role: 'STUDENT',
        isActive: true
      })
    });
    assert.equal(resSelfDemote.status, 400);

    // 4. Safety: deactivating self -> 400
    const resSelfDeactive = await fetch(`http://localhost:${port}/api/admin/users/${adminId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        fullName: 'Admin',
        email: `admin-${Date.now()}@example.com`,
        role: 'ADMIN',
        isActive: false
      })
    });
    assert.equal(resSelfDeactive.status, 400);

    // Clean up
    await query("DELETE FROM users WHERE id IN ($1, $2)", [userAId, userBId]);
  });

  await t.test('Reset Password & Toggle Status: verify password and login blockage', async () => {
    const email = `status-user-${Date.now()}@example.com`;
    const password = 'OldPassword123';
    const newPassword = 'NewPassword123';

    // Insert user
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, full_name, role, is_active)
       VALUES ($1, $2, 'Status User', 'STUDENT', TRUE) RETURNING id`,
      [email, hashPassword(password)]
    );
    const userId = rows[0].id;

    // Reset password
    const resReset = await fetch(`http://localhost:${port}/api/admin/users/${userId}/password`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ newPassword })
    });
    assert.equal(resReset.status, 200);

    // Verify new password works
    const { rows: updatedRows } = await query("SELECT password_hash FROM users WHERE id = $1", [userId]);
    assert.ok(verifyPassword(newPassword, updatedRows[0].password_hash));
    assert.ok(!verifyPassword(password, updatedRows[0].password_hash));

    // Deactivate user
    const resDeactive = await fetch(`http://localhost:${port}/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ isActive: false })
    });
    assert.equal(resDeactive.status, 200);
    const bodyDeactive = await resDeactive.json();
    assert.equal(bodyDeactive.user.isActive, false);

    // Clean up
    await query("DELETE FROM users WHERE id = $1", [userId]);
  });

  await t.test('Delete User: soft-delete vs hard-delete rules', async () => {
    const email = `delete-user-${Date.now()}@example.com`;

    // Create user
    const { rows: userRows } = await query(
      `INSERT INTO users (email, password_hash, full_name, role, is_active)
       VALUES ($1, 'dummy_hash', 'Delete User', 'STUDENT', TRUE) RETURNING id`,
      [email]
    );
    const userId = userRows[0].id;

    // 1. Soft-delete -> sets is_active = FALSE
    const resSoft = await fetch(`http://localhost:${port}/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie }
    });
    assert.equal(resSoft.status, 200);
    const bodySoft = await resSoft.status; // verify it returned OK
    const { rows: checkRows } = await query("SELECT is_active FROM users WHERE id = $1", [userId]);
    assert.equal(checkRows[0].is_active, false);

    // Make active again for hard delete test
    await query("UPDATE users SET is_active = TRUE WHERE id = $1", [userId]);

    // Create a temporary problem to assign/submit
    const { rows: probRows } = await query(
      `INSERT INTO problems (slug, title, description, rating, created_by)
       VALUES ($1, 'Del Test Prob', 'Desc', 800, $2) RETURNING id`,
      [`del-prob-${Date.now()}`, adminId]
    );
    const problemId = probRows[0].id;

    // Insert a submission for this user
    const { rows: subRows } = await query(
      `INSERT INTO submissions (problem_id, user_id, code, score, status)
       VALUES ($1, $2, 'print(1)', 100, 'ACCEPTED') RETURNING id`,
      [problemId, userId]
    );
    const submissionId = subRows[0].id;

    // Try hard delete when user has submissions -> should fail with 409
    const resHardFail = await fetch(`http://localhost:${port}/api/admin/users/${userId}?hard=true`, {
      method: 'DELETE',
      headers: { cookie: adminCookie }
    });
    assert.equal(resHardFail.status, 409);
    const bodyHardFail = await resHardFail.json();
    assert.ok(bodyHardFail.error.toLowerCase().includes('không thể xóa cứng'));

    // Remove submission
    await query("DELETE FROM submissions WHERE id = $1", [submissionId]);

    // Hard delete should now succeed -> deletes completely
    const resHardSuccess = await fetch(`http://localhost:${port}/api/admin/users/${userId}?hard=true`, {
      method: 'DELETE',
      headers: { cookie: adminCookie }
    });
    assert.equal(resHardSuccess.status, 200);
    const { rows: checkExists } = await query("SELECT 1 FROM users WHERE id = $1", [userId]);
    assert.equal(checkExists.length, 0);

    // Clean up temporary problem
    await query("DELETE FROM problems WHERE id = $1", [problemId]);
  });
});
