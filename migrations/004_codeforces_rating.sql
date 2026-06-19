ALTER TABLE problems ADD COLUMN IF NOT EXISTS rating INTEGER NOT NULL DEFAULT 800 CHECK (rating BETWEEN 800 AND 3500 AND rating % 100 = 0);

DO $$
BEGIN
  -- Check if difficulty_level column exists to perform data migration
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'problems' AND column_name = 'difficulty_level') THEN
    UPDATE problems
    SET rating = CASE
      WHEN difficulty = 'Dễ' OR difficulty_level = 1 THEN 800
      WHEN difficulty = 'Trung bình' OR difficulty_level = 2 THEN 1200
      WHEN difficulty = 'Khó' OR difficulty_level = 3 THEN 1600
      ELSE 800
    END;
    
    ALTER TABLE problems DROP COLUMN difficulty_level;
  ELSE
    UPDATE problems
    SET rating = CASE
      WHEN difficulty = 'Dễ' THEN 800
      WHEN difficulty = 'Trung bình' THEN 1200
      WHEN difficulty = 'Khó' THEN 1600
      ELSE 800
    END;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_problems_difficulty;
CREATE INDEX IF NOT EXISTS idx_problems_rating_published ON problems(is_active, rating, published_at DESC, id DESC);
