import test from 'node:test';
import assert from 'node:assert/strict';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { query } from '../src/db.js';

const execAsync = promisify(exec);

function isLocalDatabaseUrl(url) {
  const value = String(url || '').toLowerCase();
  return (
    value.includes('localhost') ||
    value.includes('127.0.0.1') ||
    value.includes('host.docker.internal') ||
    value.includes('simpleoj_test')
  );
}

const dbUrl = process.env.DATABASE_URL || '';

if (!isLocalDatabaseUrl(dbUrl)) {
  test('Reset and Seed Basic Problems Script Tests skipped on non-local database', { skip: true }, () => {});
} else {
  test('Reset and Seed Basic Problems Script Tests', async (t) => {

    await t.test('1. Dry-run does not modify database, and Apply deletes old data and seeds exactly 5 basic exercises', async () => {
      // Check admin user existence, create one if not exists
      const adminRes = await query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
      let adminId = adminRes.rows[0]?.id;
      if (!adminId) {
        const insertedAdmin = await query(`
          INSERT INTO users (email, password_hash, full_name, role)
          VALUES ('temp-admin-test-reset@example.com', 'dummy_hash', 'Temp Admin', 'ADMIN')
          RETURNING id
        `);
        adminId = insertedAdmin.rows[0].id;
      }

      // --- SETUP PRE-EXISTING DUMMY PROBLEMS AND GROUPS ---
      console.log('Test Setup: Inserting dummy problems/groups to be reset...');
      const dummyGroupSlug = `temp-test-group-${Date.now()}`;
      const dummyGroupRes = await query(`
        INSERT INTO problem_groups (slug, name, description, group_type, is_active, created_by)
        VALUES ($1, 'Temp Group', 'Temporary', 'BASIC', TRUE, $2)
        RETURNING id
      `, [dummyGroupSlug, adminId]);
      const dummyGroupId = dummyGroupRes.rows[0].id;

      const dummyProblemSlug = `temp-test-prob-${Date.now()}`;
      const dummyProblemRes = await query(`
        INSERT INTO problems (slug, title, description, rating, max_score, passing_score, is_active, created_by)
        VALUES ($1, 'Temp Problem', 'Temporary', 800, 100, 100, TRUE, $2)
        RETURNING id
      `, [dummyProblemSlug, adminId]);
      const dummyProblemId = dummyProblemRes.rows[0].id;

      await query(`
        INSERT INTO problem_group_items (group_id, problem_id, added_by)
        VALUES ($1, $2, $3)
      `, [dummyGroupId, dummyProblemId, adminId]);

      await query(`
        INSERT INTO problem_testcases (problem_id, input, expected_output, is_public, weight, order_index)
        VALUES ($1, 'in', 'out', TRUE, 1, 0)
      `, [dummyProblemId]);

      const basicProbSlugs = [
        'bai-20-giai-phuong-trinh-bac-hai',
        'bai-21-kiem-tra-chan-le',
        'bai-22-cung-tinh-chan-le',
        'bai-23-kiem-tra-uoc-cua-nhau',
        'bai-24-tim-gia-tri-nho-nhat'
      ];
      const initialBasicRes = await query('SELECT COUNT(*)::int FROM problems WHERE slug = ANY($1)', [basicProbSlugs]);
      const initialBasicCount = initialBasicRes.rows[0].count;

      // --- RUN DRY-RUN ---
      console.log('Running dry-run...');
      const { stdout: stdoutDry, stderr: stderrDry } = await execAsync('node scripts/reset-and-seed-basic-problems.js --dry-run');
      assert.ok(stdoutDry.includes('DRY-RUN SUMMARY'), 'Should print dry-run summary');

      // Verify database remains unchanged after dry-run
      const checkAfterDryProb = await query('SELECT COUNT(*)::int FROM problems WHERE slug = $1', [dummyProblemSlug]);
      const checkAfterDryGroup = await query('SELECT COUNT(*)::int FROM problem_groups WHERE slug = $1', [dummyGroupSlug]);
      assert.equal(checkAfterDryProb.rows[0].count, 1, 'Dummy problem should still exist after dry-run');
      assert.equal(checkAfterDryGroup.rows[0].count, 1, 'Dummy group should still exist after dry-run');

      // Verify basic problems count has not changed
      const basicProbCountDry = await query('SELECT COUNT(*)::int FROM problems WHERE slug = ANY($1)', [basicProbSlugs]);
      assert.equal(basicProbCountDry.rows[0].count, initialBasicCount, 'Basic problems count should not change during dry-run');

      // --- RUN APPLY ---
      console.log('Running apply...');
      const { stdout: stdoutApply, stderr: stderrApply } = await execAsync('node scripts/reset-and-seed-basic-problems.js --apply');
      assert.ok(stdoutApply.includes('Reset and seed completed and committed successfully'), 'Should print apply completion');

      // Verify dummy data is completely gone
      const checkAfterApplyProb = await query('SELECT COUNT(*)::int FROM problems WHERE slug = $1', [dummyProblemSlug]);
      const checkAfterApplyGroup = await query('SELECT COUNT(*)::int FROM problem_groups WHERE slug = $1', [dummyGroupSlug]);
      assert.equal(checkAfterApplyProb.rows[0].count, 0, 'Dummy problem should be deleted by apply');
      assert.equal(checkAfterApplyGroup.rows[0].count, 0, 'Dummy group should be deleted by apply');

      // Verify learning data is 0
      const subCount = await query('SELECT COUNT(*)::int FROM submissions');
      const attCount = await query('SELECT COUNT(*)::int FROM attempts');
      const progCount = await query('SELECT COUNT(*)::int FROM user_problem_progress');
      const assignCount = await query('SELECT COUNT(*)::int FROM student_problem_assignments');
      assert.equal(subCount.rows[0].count, 0, 'submissions should be 0');
      assert.equal(attCount.rows[0].count, 0, 'attempts should be 0');
      assert.equal(progCount.rows[0].count, 0, 'user_problem_progress should be 0');
      assert.equal(assignCount.rows[0].count, 0, 'student_problem_assignments should be 0');

      // Verify exactly one active group
      const activeGroups = await query('SELECT id, slug, name FROM problem_groups WHERE is_active = TRUE');
      assert.equal(activeGroups.rows.length, 1, 'Should have exactly 1 active group');
      assert.equal(activeGroups.rows[0].slug, 'bai-tap-co-ban', 'Group slug must be bai-tap-co-ban');
      assert.equal(activeGroups.rows[0].name, 'Bài tập cơ bản', 'Group name must be Bài tập cơ bản');

      // Verify exactly 5 active problems
      const activeProblems = await query('SELECT id, slug, title, compare_mode, starter_code, description FROM problems WHERE is_active = TRUE ORDER BY order_index');
      assert.equal(activeProblems.rows.length, 5, 'Should have exactly 5 active problems');

      const expectedSlugs = [
        'bai-20-giai-phuong-trinh-bac-hai',
        'bai-21-kiem-tra-chan-le',
        'bai-22-cung-tinh-chan-le',
        'bai-23-kiem-tra-uoc-cua-nhau',
        'bai-24-tim-gia-tri-nho-nhat'
      ];

      for (let i = 0; i < 5; i++) {
        const prob = activeProblems.rows[i];
        assert.equal(prob.slug, expectedSlugs[i], `Slug must match at index ${i}`);
        
        // Verify compare mode
        if (prob.slug === 'bai-20-giai-phuong-trinh-bac-hai') {
          assert.equal(prob.compare_mode, 'number', 'Bài 20 must use number compareMode');
        } else {
          assert.equal(prob.compare_mode, 'token', `Problem ${prob.slug} must use token compareMode`);
        }

        // Verify starter code is empty or has only a comment
        assert.ok(
          prob.starter_code === '' || prob.starter_code.trim() === '# Viet chuong trinh cua em o day',
          `Starter code for ${prob.slug} should be empty or a placeholder comment`
        );

        // Verify description does not contain solution code or gợi ý code as code
        const descLower = prob.description.toLowerCase();
        assert.ok(!descLower.includes('def solve'), `Description of ${prob.slug} should not contain solution functions`);
        assert.ok(!descLower.includes('import sys'), `Description of ${prob.slug} should not contain Python template boilerplate`);

        // Verify every problem has at least 8 testcases
        const tcRes = await query('SELECT COUNT(*)::int FROM problem_testcases WHERE problem_id = $1', [prob.id]);
        const tcCount = tcRes.rows[0].count;
        assert.ok(tcCount >= 8, `Problem ${prob.slug} must have at least 8 test cases, found ${tcCount}`);

        // Verify problem is linked to Bài tập cơ bản group
        const linkRes = await query('SELECT COUNT(*)::int FROM problem_group_items WHERE group_id = $1 AND problem_id = $2', [activeGroups.rows[0].id, prob.id]);
        assert.equal(linkRes.rows[0].count, 1, `Problem ${prob.slug} must be linked to Bài tập cơ bản group`);
      }

      // Verify no orphan active problems
      const orphans = await query(`
        SELECT p.id, p.slug 
        FROM problems p
        LEFT JOIN problem_group_items pgi ON pgi.problem_id = p.id
        LEFT JOIN problem_groups g ON g.id = pgi.group_id AND g.is_active = TRUE
        WHERE p.is_active = TRUE
        GROUP BY p.id, p.slug
        HAVING COUNT(g.id) = 0
      `);
      assert.equal(orphans.rows.length, 0, 'No active problem should be orphaned (must belong to at least one active group)');

      // Verify no empty active groups
      const emptyGroups = await query(`
        SELECT g.id, g.slug
        FROM problem_groups g
        LEFT JOIN problem_group_items pgi ON pgi.group_id = g.id
        LEFT JOIN problems p ON p.id = pgi.problem_id AND p.is_active = TRUE
        WHERE g.is_active = TRUE
        GROUP BY g.id, g.slug
        HAVING COUNT(p.id) = 0
      `);
      assert.equal(emptyGroups.rows.length, 0, 'No active group should be empty');
    });
  });
}
