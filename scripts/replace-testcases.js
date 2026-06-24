import 'dotenv/config';
import { pool, transaction } from '../src/db.js';
import { canonicalProblems } from '../data/canonical-problems.js';

const isApply = process.argv.includes('--apply');

async function replaceTestcases() {
  console.log('--- BAT DAU THAY THE TESTCASES (replace-testcases.js) ---');
  
  // Connect and execute
  await transaction(async (client) => {
    for (const problem of canonicalProblems) {
      const slug = problem.slug;
      
      // 1. Get problem ID by slug
      const { rows } = await client.query(
        'SELECT id, title FROM problems WHERE slug = $1',
        [slug]
      );

      if (rows.length === 0) {
        console.log(`⚠️ Skip: Bài viết "${slug}" chưa tồn tại trong DB (sẽ được seed sau).`);
        continue;
      }

      const problemId = rows[0].id;
      const title = rows[0].title;

      // 2. Count existing testcases
      const countRes = await client.query(
        'SELECT COUNT(*)::int AS cnt FROM problem_testcases WHERE problem_id = $1',
        [problemId]
      );
      const oldCount = countRes.rows[0].cnt;
      const newCount = problem.testcases.length;

      console.log(`Problem: "${title}" (${slug})`);
      console.log(`  - Số lượng testcase cũ: ${oldCount}`);
      console.log(`  - Số lượng testcase mới: ${newCount}`);

      if (isApply) {
        // Delete existing testcases
        await client.query(
          'DELETE FROM problem_testcases WHERE problem_id = $1',
          [problemId]
        );

        // Insert new ones
        for (const tc of problem.testcases) {
          await client.query(
            `INSERT INTO problem_testcases (problem_id, input, expected_output, explanation, is_public, weight, order_index)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              problemId,
              tc.input,
              tc.output,
              tc.explanation || '',
              tc.isPublic ?? false,
              tc.weight ?? 1,
              tc.orderIndex ?? 0
            ]
          );
        }
        console.log(`  -> Đã cập nhật thành công ${newCount} testcases.`);
      }
    }
  });

  if (!isApply) {
    console.log('\n======================================================');
    console.log('CHÚ Ý: Đang chạy ở chế độ DRY-RUN. Không lưu thay đổi vào DB.');
    console.log('Chạy lệnh dưới để áp dụng thay đổi:');
    console.log('  node scripts/replace-testcases.js --apply');
    console.log('======================================================\n');
  }
}

async function main() {
  try {
    await replaceTestcases();
    pool.end();
  } catch (err) {
    console.error('❌ Lỗi thay thế testcases:', err.message);
    pool.end();
    process.exit(1);
  }
}

main();
