import 'dotenv/config';
import { pool, transaction } from '../src/db.js';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

const isApply = process.argv.includes('--apply');

// Helper for timestamp
function getTimestamp() {
  const d = new Date();
  const YYYY = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${YYYY}${MM}${DD}-${HH}${mm}${ss}`;
}

async function runBackup() {
  const ts = getTimestamp();
  const backupDir = join(REPO_ROOT, 'backups');
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const tables = [
    { name: 'problems', query: 'SELECT * FROM problems ORDER BY created_at, slug;' },
    { name: 'problem_testcases', query: 'SELECT * FROM problem_testcases ORDER BY problem_id, order_index;' },
    { name: 'submissions', query: 'SELECT * FROM submissions ORDER BY created_at;' },
    { name: 'attempts', query: 'SELECT * FROM attempts ORDER BY started_at;' },
    { name: 'user_problem_progress', query: 'SELECT * FROM user_problem_progress ORDER BY user_id, problem_id;' },
    { name: 'student_problem_assignments', query: 'SELECT * FROM student_problem_assignments ORDER BY assigned_at;' }
  ];

  console.log(`--- BAT DAU SAO LUU DU LIEU (Timestamp: ${ts}) ---`);
  for (const t of tables) {
    try {
      const { rows } = await pool.query(t.query);
      const filePath = join(backupDir, `${t.name}-before-cleanup-${ts}.json`);
      writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf8');
      console.log(`✅ Da luu bang "${t.name}" -> ${filePath} (${rows.length} dong)`);
    } catch (err) {
      console.error(`❌ Loi sao luu bang "${t.name}":`, err.message);
      throw err;
    }
  }
}

async function detectDuplicates() {
  // Fetch all problems with counts of related tables
  const { rows: problems } = await pool.query(`
    SELECT 
      p.id, 
      p.slug, 
      p.title, 
      p.source,
      p.description,
      COUNT(DISTINCT s.id)::int AS submissions_count,
      COUNT(DISTINCT a.id)::int AS attempts_count,
      COUNT(DISTINCT upp.user_id)::int AS progress_count,
      COUNT(DISTINCT spa.id)::int AS assignments_count,
      COUNT(DISTINCT tc.id)::int AS testcase_count
    FROM problems p
    LEFT JOIN submissions s ON s.problem_id = p.id
    LEFT JOIN attempts a ON a.problem_id = p.id
    LEFT JOIN user_problem_progress upp ON upp.problem_id = p.id
    LEFT JOIN student_problem_assignments spa ON spa.problem_id = p.id
    LEFT JOIN problem_testcases tc ON tc.problem_id = p.id
    GROUP BY p.id, p.slug, p.title, p.source, p.description
    ORDER BY p.title
  `);

  // Helper for title normalization
  function normalizeTitle(title) {
    return String(title || '')
      .toLowerCase()
      .replace(/bài\s+\d+:/gi, '')
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Group by normalized title
  const byTitle = new Map();
  for (const p of problems) {
    const norm = normalizeTitle(p.title);
    if (!byTitle.has(norm)) byTitle.set(norm, []);
    byTitle.get(norm).push(p);
  }

  console.log('\n--- PHAT HIEN TRUNG LAP THEO TIEU DE (FUZZY TITLE DETECT) ---');
  for (const [norm, list] of byTitle.entries()) {
    if (list.length > 1) {
      console.log(`⚠️ Trung tieu de normalized: "${norm}"`);
      for (const p of list) {
        console.log(`   - ID: ${p.id} | Slug: ${p.slug} | Title: "${p.title}" | Submissions: ${p.submissions_count} | Attempts: ${p.attempts_count}`);
      }
    }
  }

  // Check by same source
  const sourceGroups = await pool.query(`
    SELECT source, COUNT(*)
    FROM problems
    WHERE source IS NOT NULL AND source <> ''
    GROUP BY source
    HAVING COUNT(*) > 1
  `);
  if (sourceGroups.rows.length > 0) {
    console.log('\n--- PHAT HIEN TRUNG LAP THEO NGUON (SAME SOURCE DETECT) ---');
    for (const row of sourceGroups.rows) {
      console.log(`⚠️ Trung nguon: "${row.source}"`);
      const matched = problems.filter(p => p.source === row.source);
      for (const p of matched) {
        console.log(`   - ID: ${p.id} | Slug: ${p.slug} | Title: "${p.title}" | Submissions: ${p.submissions_count} | Attempts: ${p.attempts_count}`);
      }
    }
  }

  return problems;
}

const knownDuplicateGroups = [
  {
    reason: 'Same Watermelon problem',
    keepSlug: 'cf-4a-watermelon',
    deleteSlugs: ['watermelon']
  }
];

async function applyCleanup(problems) {
  console.log('\n--- BAT DAU THUC HIEN DON DEP & DI TRU DU LIEU ---');

  await transaction(async (client) => {
    for (const group of knownDuplicateGroups) {
      console.log(`\nProcessing group: ${group.reason}`);
      
      const canonical = problems.find(p => p.slug === group.keepSlug);
      if (!canonical) {
        console.warn(`⚠️ Khong tim thay bai toan canonical voi slug "${group.keepSlug}". Bo qua.`);
        continue;
      }

      console.log(`Canonical Problem: ID = ${canonical.id}, Slug = ${canonical.slug}, Title = "${canonical.title}"`);

      for (const delSlug of group.deleteSlugs) {
        const dup = problems.find(p => p.slug === delSlug);
        if (!dup) {
          console.log(`ℹ️ Bai toan trung lap "${delSlug}" khong ton tai trong DB. Bo qua.`);
          continue;
        }

        console.log(`Duplicate Problem to delete: ID = ${dup.id}, Slug = ${dup.slug}, Title = "${dup.title}"`);
        console.log(`  Data impact:`);
        console.log(`    - Submissions: ${dup.submissions_count}`);
        console.log(`    - Attempts: ${dup.attempts_count}`);
        console.log(`    - Assignments: ${dup.assignments_count}`);
        console.log(`    - Testcases: ${dup.testcase_count}`);

        // Migrate submissions
        if (dup.submissions_count > 0) {
          const subRes = await client.query(
            'UPDATE submissions SET problem_id = $1 WHERE problem_id = $2',
            [canonical.id, dup.id]
          );
          console.log(`    -> Da di tru ${subRes.rowCount} submissions sang canonical.`);
        }

        // Migrate attempts
        if (dup.attempts_count > 0) {
          const attRes = await client.query(
            'UPDATE attempts SET problem_id = $1 WHERE problem_id = $2',
            [canonical.id, dup.id]
          );
          console.log(`    -> Da di tru ${attRes.rowCount} attempts sang canonical.`);
        }

        // Migrate assignments carefully
        if (dup.assignments_count > 0) {
          const { rows: assignments } = await client.query(
            'SELECT id, user_id, status FROM student_problem_assignments WHERE problem_id = $1',
            [dup.id]
          );

          for (const asm of assignments) {
            if (asm.status === 'ASSIGNED') {
              // Check if user already has an active assignment for the canonical problem
              const existing = await client.query(
                `SELECT id FROM student_problem_assignments 
                 WHERE user_id = $1 AND problem_id = $2 AND status = 'ASSIGNED'`,
                [asm.user_id, canonical.id]
              );

              if (existing.rows.length > 0) {
                // Cancel the duplicate assignment
                await client.query(
                  `UPDATE student_problem_assignments 
                   SET status = 'CANCELLED', cancelled_at = NOW(), note = 'Cancelled due to canonical merge'
                   WHERE id = $1`,
                  [asm.id]
                );
                console.log(`    -> Huy assignment ASSIGNED cho User ${asm.user_id} (do da co assignment cho canonical).`);
              } else {
                // Move assignment to canonical
                await client.query(
                  'UPDATE student_problem_assignments SET problem_id = $1 WHERE id = $2',
                  [canonical.id, asm.id]
                );
                console.log(`    -> Chuyen assignment ASSIGNED cho User ${asm.user_id} sang canonical.`);
              }
            } else {
              // Non-active assignment, just move problem_id
              await client.query(
                'UPDATE student_problem_assignments SET problem_id = $1 WHERE id = $2',
                [canonical.id, asm.id]
              );
              console.log(`    -> Chuyen assignment ${asm.status} cho User ${asm.user_id} sang canonical.`);
            }
          }
        }

        // Delete user progress entries for duplicate problem
        const progRes = await client.query(
          'DELETE FROM user_problem_progress WHERE problem_id = $1',
          [dup.id]
        );
        console.log(`    -> Da xoa ${progRes.rowCount} progress entries cua bai trung lap.`);

        // Finally, delete the duplicate problem row
        const delRes = await client.query(
          'DELETE FROM problems WHERE id = $1',
          [dup.id]
        );
        console.log(`    -> ĐÃ XÓA thành công bài trùng lặp "${delSlug}".`);
      }
    }
  });

  console.log('✅ Da hoan thanh di tru va don dep trung lap.');
}

async function main() {
  try {
    // 1. Run Backup
    await runBackup();

    // 2. Detect duplicates
    const problems = await detectDuplicates();

    // 3. Apply changes if requested
    if (isApply) {
      await applyCleanup(problems);
    } else {
      console.log('\n======================================================');
      console.log('CHÚ Ý: Dang o che do DRY-RUN. Khong co thay doi nao duoc ap dung.');
      console.log('De thuc hien don dep va di tru thuc te, hay chay voi tham so:');
      console.log('  node scripts/cleanup-duplicate-problems.js --apply');
      console.log('======================================================\n');
    }

    pool.end();
  } catch (err) {
    console.error('❌ Loi nghiem trong xay ra:', err.message);
    pool.end();
    process.exit(1);
  }
}

main();
