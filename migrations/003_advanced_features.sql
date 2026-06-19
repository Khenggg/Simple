ALTER TABLE problems ADD COLUMN IF NOT EXISTS difficulty_level SMALLINT DEFAULT 1;
ALTER TABLE problems ADD COLUMN IF NOT EXISTS max_score INTEGER DEFAULT 100;
ALTER TABLE problems ADD COLUMN IF NOT EXISTS passing_score INTEGER DEFAULT 100;
ALTER TABLE problems ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE problems ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE problems ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS problem_testcases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  input TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  explanation TEXT DEFAULT '',
  is_public BOOLEAN DEFAULT false,
  weight INTEGER DEFAULT 1,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classroom_members (
  classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (classroom_id, user_id)
);

CREATE TABLE IF NOT EXISTS problem_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  is_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS problem_assignment_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES problem_assignments(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('ALL', 'CLASSROOM', 'STUDENT')),
  classroom_id UUID REFERENCES classrooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT check_target_values CHECK (
    (target_type = 'ALL' AND classroom_id IS NULL AND user_id IS NULL) OR
    (target_type = 'CLASSROOM' AND classroom_id IS NOT NULL AND user_id IS NULL) OR
    (target_type = 'STUDENT' AND classroom_id IS NULL AND user_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS user_problem_progress (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  best_submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  best_score INTEGER DEFAULT 0,
  best_status TEXT,
  submission_count INTEGER DEFAULT 0,
  first_started_at TIMESTAMPTZ DEFAULT NOW(),
  last_submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, problem_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'problems' AND column_name = 'testcases') THEN
    INSERT INTO problem_testcases (problem_id, input, expected_output, is_public, weight, order_index)
    SELECT
      p.id AS problem_id,
      COALESCE(tc->>'input', '') AS input,
      COALESCE(tc->>'output', '') AS expected_output,
      false AS is_public,
      1 AS weight,
      (ordinality - 1) AS order_index
    FROM problems p
    CROSS JOIN LATERAL jsonb_array_elements(p.testcases) WITH ORDINALITY AS tc(tc, ordinality)
    ON CONFLICT DO NOTHING;

    ALTER TABLE problems DROP COLUMN testcases;
  END IF;
END $$;

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
  user_id,
  problem_id,
  NULL AS best_submission_id,
  0 AS best_score,
  NULL AS best_status,
  0 AS submission_count,
  MIN(started_at) AS first_started_at,
  NULL AS last_submitted_at,
  NULL AS completed_at,
  NOW() AS updated_at
FROM attempts
GROUP BY user_id, problem_id
ON CONFLICT (user_id, problem_id) DO NOTHING;

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

CREATE INDEX IF NOT EXISTS idx_problems_published_at ON problems (is_active, published_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON problems (difficulty_level);
CREATE INDEX IF NOT EXISTS idx_user_problem_progress_completed ON user_problem_progress (user_id, completed_at DESC) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_problem_progress_todo ON user_problem_progress (user_id) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_problem_assignments_problem ON problem_assignments (problem_id);
CREATE INDEX IF NOT EXISTS idx_problem_testcases_problem ON problem_testcases (problem_id, order_index);
