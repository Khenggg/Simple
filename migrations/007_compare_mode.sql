ALTER TABLE problems ADD COLUMN IF NOT EXISTS compare_mode TEXT NOT NULL DEFAULT 'token' CHECK (compare_mode IN ('exact', 'trim', 'token', 'number'));
ALTER TABLE problems ADD COLUMN IF NOT EXISTS number_tolerance DOUBLE PRECISION NOT NULL DEFAULT 1e-6;
