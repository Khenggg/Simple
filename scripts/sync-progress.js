import 'dotenv/config';
import { pool } from '../src/db.js';

async function syncProgress() {
  console.log('--- BAT DAU DONG BO TIEN TRINH (user_problem_progress) ---');
  
  try {
    // 1. Delete progress entries pointing to deleted problems (or users)
    const delProg = await pool.query(
      'DELETE FROM user_problem_progress WHERE problem_id NOT IN (SELECT id FROM problems)'
    );
    console.log(`✅ Đã xóa ${delProg.rowCount} dòng progress mồ côi (không thuộc bài học nào).`);

    // 2. Rebuild progress from submissions table
    const rebuildSql = `
      WITH best_subs AS (
        SELECT DISTINCT ON (user_id, problem_id)
          id,
          user_id,
          problem_id,
          score,
          status,
          created_at
        FROM submissions
        ORDER BY user_id, problem_id, score DESC, created_at ASC
      ),
      agg_subs AS (
        SELECT
          user_id,
          problem_id,
          COUNT(*)::int AS cnt,
          MIN(created_at) AS first_sub,
          MAX(created_at) AS last_sub,
          MIN(CASE WHEN status = 'ACCEPTED' OR score >= 100 THEN created_at END) AS first_completed
        FROM submissions
        GROUP BY user_id, problem_id
      )
      INSERT INTO user_problem_progress (
        user_id,
        problem_id,
        best_submission_id,
        best_score,
        best_status,
        submission_count,
        first_started_at,
        last_submitted_at,
        completed_at,
        updated_at
      )
      SELECT
        agg.user_id,
        agg.problem_id,
        b.id,
        b.score,
        b.status,
        agg.cnt,
        agg.first_sub,
        agg.last_sub,
        agg.first_completed,
        NOW()
      FROM agg_subs agg
      JOIN best_subs b
        ON b.user_id = agg.user_id
       AND b.problem_id = agg.problem_id
      ON CONFLICT (user_id, problem_id) DO UPDATE SET
        best_submission_id = EXCLUDED.best_submission_id,
        best_score = EXCLUDED.best_score,
        best_status = EXCLUDED.best_status,
        submission_count = EXCLUDED.submission_count,
        first_started_at = EXCLUDED.first_started_at,
        last_submitted_at = EXCLUDED.last_submitted_at,
        completed_at = EXCLUDED.completed_at,
        updated_at = NOW();
    `;

    const rebuildRes = await pool.query(rebuildSql);
    console.log(`✅ Đã đồng bộ/tính toán lại ${rebuildRes.rowCount} dòng user_problem_progress.`);
  } catch (err) {
    console.error('❌ Lỗi đồng bộ tiến trình:', err.message);
    throw err;
  }
}

async function main() {
  try {
    await syncProgress();
    pool.end();
  } catch (err) {
    pool.end();
    process.exit(1);
  }
}

main();
