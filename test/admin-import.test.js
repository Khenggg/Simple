import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import app from '../src/server.js';
import { query } from '../src/db.js';
import { config } from '../src/config.js';

test('Admin Import API integration', async (t) => {
  let server;
  let port;
  let cookieHeader;
  let adminId;

  t.before(async () => {
    // Start temporary test server
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;

    // Get an existing admin user from DB
    const { rows } = await query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
    if (!rows[0]) {
      throw new Error('No admin user found in database. Seed the database first.');
    }
    adminId = rows[0].id;
    const token = jwt.sign({ sub: adminId, role: 'ADMIN' }, config.jwtSecret, { expiresIn: '1h' });
    cookieHeader = `simpleoj_session=${token}`;
  });

  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('Import 2 valid problems successfully', async () => {
    // Delete potential leftovers
    await query("DELETE FROM problems WHERE slug IN ('test-import-1', 'test-import-2')");

    const payload = [
      {
        slug: 'test-import-1',
        title: 'Test Import 1',
        description: 'Description 1',
        rating: 1000,
        testcases: [{ input: '1', output: '1', weight: 1, isPublic: true }]
      },
      {
        slug: 'test-import-2',
        title: 'Test Import 2',
        description: 'Description 2',
        rating: 1200,
        testcases: [{ input: '2', output: '2', weight: 10, isPublic: false }]
      }
    ];

    const res = await fetch(`http://localhost:${port}/api/admin/problems/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.imported, 2);
    assert.equal(data.created, 2);
    assert.equal(data.updated, 0);

    // Verify DB insertion
    const dbRes = await query("SELECT id, title, rating FROM problems WHERE slug = 'test-import-1'");
    assert.equal(dbRes.rows.length, 1);
    assert.equal(dbRes.rows[0].title, 'Test Import 1');
  });

  await t.test('Import 1 valid + 1 invalid fails and rolls back (atomic)', async () => {
    // Delete potential leftovers
    await query("DELETE FROM problems WHERE slug IN ('test-valid-atomic', 'test-invalid-atomic')");

    const payload = [
      {
        slug: 'test-valid-atomic',
        title: 'Valid Problem',
        description: 'Valid Desc',
        rating: 1000,
        testcases: [{ input: '1', output: '1', weight: 1, isPublic: true }]
      },
      {
        slug: 'test-invalid-atomic',
        title: 'Invalid Problem',
        description: 'Invalid because of negative weight',
        rating: 1200,
        testcases: [{ input: '2', output: '2', weight: -5, isPublic: false }] // Negative weight fails validation
      }
    ];

    const res = await fetch(`http://localhost:${port}/api/admin/problems/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 400);
    
    // Verify none were written to the DB
    const validCheck = await query("SELECT id FROM problems WHERE slug = 'test-valid-atomic'");
    assert.equal(validCheck.rows.length, 0);

    const invalidCheck = await query("SELECT id FROM problems WHERE slug = 'test-invalid-atomic'");
    assert.equal(invalidCheck.rows.length, 0);
  });

  await t.test('Re-import same slug updates details and replaces testcases', async () => {
    // Clean up
    await query("DELETE FROM problems WHERE slug = 'test-update-slug'");

    const firstPayload = [
      {
        slug: 'test-update-slug',
        title: 'Initial Title',
        description: 'Description',
        rating: 800,
        testcases: [
          { input: 'a', output: '1', weight: 1, isPublic: true },
          { input: 'b', output: '2', weight: 2, isPublic: false }
        ]
      }
    ];

    const res1 = await fetch(`http://localhost:${port}/api/admin/problems/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify(firstPayload)
    });
    assert.equal(res1.status, 200);

    // Second payload updates title and has 3 new testcases
    const secondPayload = [
      {
        slug: 'test-update-slug',
        title: 'Updated Title',
        description: 'Description',
        rating: 1000,
        testcases: [
          { input: 'c', output: '3', weight: 5, isPublic: true },
          { input: 'd', output: '4', weight: 5, isPublic: true },
          { input: 'e', output: '5', weight: 5, isPublic: true }
        ]
      }
    ];

    const res2 = await fetch(`http://localhost:${port}/api/admin/problems/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify(secondPayload)
    });

    assert.equal(res2.status, 200);
    const data = await res2.json();
    assert.equal(data.imported, 1);
    assert.equal(data.created, 0);
    assert.equal(data.updated, 1);

    // Verify DB update
    const prob = await query("SELECT id, title, rating FROM problems WHERE slug = 'test-update-slug'");
    assert.equal(prob.rows[0].title, 'Updated Title');
    assert.equal(prob.rows[0].rating, 1000);

    // Verify old testcases are deleted and only new ones exist (3 total)
    const tcs = await query("SELECT input, expected_output, weight FROM problem_testcases WHERE problem_id = $1 ORDER BY order_index ASC", [prob.rows[0].id]);
    assert.equal(tcs.rows.length, 3);
    assert.equal(tcs.rows[0].input, 'c');
    assert.equal(tcs.rows[1].input, 'd');
    assert.equal(tcs.rows[2].input, 'e');
  });

  await t.test('Import old JSON format using id, expected_output, and is_public works', async () => {
    await query("DELETE FROM problems WHERE slug = 'old-format-slug'");

    const payload = [
      {
        id: 'old-format-slug',
        title: 'Old Format Problem',
        description: 'Description',
        difficultyLevel: 2, // Maps to 1200 rating
        template: 'print("Hello")',
        testcases: [
          { input: 'in', expected_output: 'out', is_public: true }
        ]
      }
    ];

    const res = await fetch(`http://localhost:${port}/api/admin/problems/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 200);
    const dbRes = await query("SELECT id, rating, starter_code FROM problems WHERE slug = 'old-format-slug'");
    assert.equal(dbRes.rows[0].rating, 1200);
    assert.equal(dbRes.rows[0].starter_code, 'print("Hello")');

    const tcRes = await query("SELECT expected_output, is_public FROM problem_testcases WHERE problem_id = $1", [dbRes.rows[0].id]);
    assert.equal(tcRes.rows[0].expected_output, 'out');
    assert.equal(tcRes.rows[0].is_public, true);
  });
});
