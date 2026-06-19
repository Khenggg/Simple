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
  b.id AS best_submission_id,
  b.score AS best_score,
  b.status AS best_status,
  agg.cnt AS submission_count,
  agg.first_sub AS first_started_at,
  agg.last_sub AS last_submitted_at,
  agg.first_completed AS completed_at,
  NOW() AS updated_at
FROM agg_subs agg
JOIN best_subs b ON b.user_id = agg.user_id AND b.problem_id = agg.problem_id
ON CONFLICT (user_id, problem_id) DO UPDATE SET
  best_submission_id = EXCLUDED.best_submission_id,
  best_score = EXCLUDED.best_score,
  best_status = EXCLUDED.best_status,
  submission_count = EXCLUDED.submission_count,
  last_submitted_at = EXCLUDED.last_submitted_at,
  completed_at = EXCLUDED.completed_at,
  updated_at = NOW();
