import 'dotenv/config';
import { pool, transaction } from '../src/db.js';
import { canonicalProblems } from '../data/canonical-problems.js';
import { normalizeProblem } from '../src/validation.js';

const apply = process.argv.includes('--apply');
const dryRun = !apply;

if (dryRun) {
  console.log('=== DRY-RUN MODE (No database changes will be made) ===\n');
} else {
  console.log('=== APPLY MODE (Database changes will be written) ===\n');
}

async function run() {
  // Find Bài 20 in canonicalProblems
  const rawProblem = canonicalProblems.find(p => p.slug === 'bai-20-giai-phuong-trinh-bac-hai');
  if (!rawProblem) {
    console.error('Error: Cannot find Bài 20 in data/canonical-problems.js');
    process.exit(1);
  }

  // Normalize problem using SimpleOJ's validation rules
  const p = normalizeProblem({
    ...rawProblem,
    timeLimitMinutes: rawProblem.timeLimitMinutes ?? 30,
    executionLimitMs: rawProblem.executionLimitMs ?? 1500
  });

  try {
    // Find admin user
    const adminRes = await pool.query("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1");
    const adminId = adminRes.rows[0]?.id || null;

    await transaction(async (client) => {
      // Check if problem already exists
      const existingRes = await client.query('SELECT id FROM problems WHERE slug = $1', [p.slug]);
      const existingProblem = existingRes.rows[0];

      let problemId;
      let oldTestcaseCount = 0;

      if (existingProblem) {
        problemId = existingProblem.id;
        
        // Count old testcases
        const tcCountRes = await client.query('SELECT COUNT(*) FROM problem_testcases WHERE problem_id = $1', [problemId]);
        oldTestcaseCount = parseInt(tcCountRes.rows[0].count, 10);

        console.log(`Problem exists (ID: ${problemId}, Slug: ${p.slug}).`);
        
        if (!dryRun) {
          // Update details
          await client.query(
            `UPDATE problems
             SET title = $1, difficulty = $2, rating = $3, max_score = $4, passing_score = $5,
                 published_at = $6, source = $7, order_index = $8, description = $9,
                 starter_code = $10, examples = $11::jsonb, time_limit_minutes = $12, execution_limit_ms = $13,
                 compare_mode = $14, number_tolerance = $15, is_active = $16
             WHERE id = $17`,
            [
              p.title, p.difficulty, p.rating, p.maxScore, p.passingScore, p.publishedAt, p.source, p.orderIndex,
              p.description, p.starterCode, JSON.stringify(p.examples), p.timeLimitMinutes, p.executionLimitMs,
              p.compareMode, p.numberTolerance, p.isActive, problemId
            ]
          );
          console.log(`Updated problem metadata.`);
        }
      } else {
        console.log(`Problem does not exist. It will be created as [NEW].`);
        
        if (!dryRun) {
          // Insert problem
          const insertRes = await client.query(
            `INSERT INTO problems(slug, title, difficulty, rating, max_score, passing_score, published_at, source, order_index, description, starter_code, examples, time_limit_minutes, execution_limit_ms, compare_mode, number_tolerance, is_active, created_by)
             VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17, $18)
             RETURNING id`,
            [
              p.slug, p.title, p.difficulty, p.rating, p.maxScore, p.passingScore, p.publishedAt, p.source, p.orderIndex,
              p.description, p.starterCode, JSON.stringify(p.examples), p.timeLimitMinutes, p.executionLimitMs,
              p.compareMode, p.numberTolerance, p.isActive, adminId
            ]
          );
          problemId = insertRes.rows[0].id;
          console.log(`Created new problem (ID: ${problemId}).`);
        }
      }

      if (!dryRun) {
        // Delete old testcases
        await client.query('DELETE FROM problem_testcases WHERE problem_id = $1', [problemId]);
        console.log(`Deleted ${oldTestcaseCount} old testcases.`);

        // Insert new testcases
        let orderIndex = 0;
        for (const tc of p.testcases) {
          await client.query(
            `INSERT INTO problem_testcases(problem_id, input, expected_output, explanation, is_public, weight, order_index)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [problemId, tc.input, tc.output, tc.explanation ?? '', tc.isPublic, tc.weight, orderIndex++]
          );
        }
        console.log(`Inserted ${p.testcases.length} canonical testcases.`);
      } else {
        console.log(`[Dry-Run] Would delete ${oldTestcaseCount} old testcases.`);
        console.log(`[Dry-Run] Would insert ${p.testcases.length} new testcases.`);
      }

      // Print info
      console.log(`\nSummary of details:`);
      console.log(`- Problem ID: ${problemId || '[NEW]'}`);
      console.log(`- Slug: ${p.slug}`);
      console.log(`- Title: ${p.title}`);
      console.log(`- Old Testcases: ${oldTestcaseCount}`);
      console.log(`- New Testcases: ${p.testcases.length}`);
      console.log(`- Compare Mode: ${p.compareMode}`);
      console.log(`- Number Tolerance: ${p.numberTolerance}`);

      if (dryRun) {
        throw new Error('ROLLBACK_DRY_RUN');
      }
    });

    if (dryRun) {
      console.log('\n[Dry-Run] Rollback completed successfully. No changes saved.');
    } else {
      console.log('\n[Apply] Transaction committed successfully. Changes saved to database.');
    }
  } catch (error) {
    if (error.message === 'ROLLBACK_DRY_RUN') {
      // expected for dry run
    } else {
      console.error('Error during execution:', error);
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

run();
