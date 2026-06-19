CREATE TABLE IF NOT EXISTS student_problem_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'COMPLETED', 'CANCELLED')),
  note TEXT NOT NULL DEFAULT '',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  copied_from_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  copied_from_assignment_id UUID REFERENCES student_problem_assignments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_student_problem_assignment
ON student_problem_assignments(user_id, problem_id)
WHERE status = 'ASSIGNED';

CREATE INDEX IF NOT EXISTS idx_student_assignments_user_status
ON student_problem_assignments(user_id, status, assigned_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_assignments_problem
ON student_problem_assignments(problem_id);

INSERT INTO student_problem_assignments (
  user_id,
  problem_id,
  assigned_by,
  status,
  note,
  assigned_at,
  completed_at,
  cancelled_at,
  copied_from_user_id,
  copied_from_assignment_id,
  created_at,
  updated_at
)
WITH latest_student_assignments AS (
  SELECT DISTINCT ON (pat.user_id, pa.problem_id)
    pat.user_id,
    pa.problem_id,
    pa.assigned_by,
    COALESCE(NULLIF(pa.title, ''), '') AS note,
    pa.created_at AS assigned_at,
    COALESCE(upp.completed_at, CASE WHEN upp.best_score >= 100 THEN NOW() END) AS completed_at
  FROM problem_assignments pa
  JOIN problem_assignment_targets pat ON pat.assignment_id = pa.id
  LEFT JOIN user_problem_progress upp
    ON upp.user_id = pat.user_id
   AND upp.problem_id = pa.problem_id
  WHERE pat.target_type = 'STUDENT'
  ORDER BY pat.user_id, pa.problem_id, pa.created_at DESC
)
SELECT
  user_id,
  problem_id,
  assigned_by,
  CASE WHEN completed_at IS NOT NULL THEN 'COMPLETED' ELSE 'ASSIGNED' END,
  note,
  assigned_at,
  completed_at,
  NULL::timestamptz,
  NULL::uuid,
  NULL::uuid,
  assigned_at,
  NOW()
FROM latest_student_assignments
ON CONFLICT DO NOTHING;
