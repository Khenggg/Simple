CREATE TABLE IF NOT EXISTS problem_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  group_type TEXT NOT NULL DEFAULT 'CUSTOM'
    CHECK (group_type IN ('BASIC', 'PRACTICE', 'ADVANCED', 'HSG', 'TOPIC', 'CUSTOM')),
  color TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS problem_group_items (
  group_id UUID NOT NULL REFERENCES problem_groups(id) ON DELETE CASCADE,
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, problem_id)
);

CREATE INDEX IF NOT EXISTS idx_problem_groups_active_order
ON problem_groups(is_active, order_index, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_problem_group_items_problem
ON problem_group_items(problem_id);

CREATE INDEX IF NOT EXISTS idx_problem_group_items_group_order
ON problem_group_items(group_id, order_index);
