# Project Architecture Map: SimpleOJ

This file contains the directory tree and full code contents of the non-ignored files in the SimpleOJ repository.

## 1. Directory Tree

```markdown
- 📄 .env (0.5 KB)
- 📄 .env.example (0.6 KB)
- 📄 docker-compose.yml (0.3 KB)
- 📄 Dockerfile (0.6 KB)
- 📁 **docs/**
  - 📁 **reference-configs/**
  - 📄 spec.md (2.0 KB)
- 📁 **migrations/**
  - 📄 001_initial.sql (2.7 KB)
  - 📄 002_add_limits_status.sql (0.3 KB)
  - 📄 003_advanced_features.sql (6.2 KB)
  - 📄 004_codeforces_rating.sql (1.0 KB)
  - 📄 005_sync_progress.sql (1.4 KB)
  - 📄 006_student_problem_assignments.sql (2.3 KB)
  - 📄 007_compare_mode.sql (0.2 KB)
- 📄 package.json (0.7 KB)
- 📁 **plans/**
  - 📁 **archive/**
  - 📁 **prds/**
  - 📁 **sprints/**
- 📄 problems.json (4.4 KB)
- 📁 **public/**
  - 📄 index.html (1.6 KB)
- 📄 render.yaml (0.7 KB)
- 📁 **scripts/**
  - 📄 migrate.js (1.1 KB)
  - 📄 seed.js (3.2 KB)
- 📁 **src/**
  - 📄 auth.js (2.1 KB)
  - 📄 codeforces-vi-problems.js (11.0 KB)
  - 📄 config.js (1.4 KB)
  - 📄 db.js (0.6 KB)
  - 📄 judge.js (11.0 KB)
  - 📄 python-runner.py (3.7 KB)
  - 📄 server.js (42.3 KB)
  - 📄 terminal-runner.py (4.7 KB)
  - 📄 terminal.js (19.7 KB)
  - 📄 validation.js (7.7 KB)
- 📁 **test/**
  - 📄 admin-import.test.js (7.1 KB)
  - 📄 core.test.js (3.1 KB)
  - 📄 errors.test.js (3.6 KB)
  - 📄 judge-compare.test.js (4.6 KB)
  - 📄 submission-flow.test.js (11.1 KB)
- 📄 vercel.json (0.1 KB)
```

## 2. File Contents

### File: `.env`

```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres.mibkdwpnrwgakbuusmmr:Moghicha12%40@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres
DATABASE_SSL=true
JWT_SECRET=12345678-12345678-12345678-12345678
ADMIN_EMAIL=admin@gmail.com
ADMIN_PASSWORD=admin123
ADMIN_NAME=Khang
PYTHON_COMMAND=python3
# Vercel: trỏ tới một SimpleOJ instance trên Render dùng làm judge service.
# JUDGE_SERVICE_URL=https://your-judge.onrender.com
# JUDGE_SERVICE_TOKEN=replace-with-a-long-random-token
```

### File: `.env.example`

```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/simpleoj
DATABASE_SSL=false
JWT_SECRET=replace-with-at-least-32-random-characters
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=ChangeMe123!
ADMIN_NAME=Quản trị viên
PYTHON_COMMAND=python
TERMINAL_PROCESS_TIMEOUT_MS=60000
TERMINAL_SESSION_TIMEOUT_MS=600000
TERMINAL_MAX_OUTPUT_BYTES=100000
# Vercel: trỏ tới một SimpleOJ instance trên Render dùng làm judge service.
# JUDGE_SERVICE_URL=https://your-judge.onrender.com
# JUDGE_SERVICE_TOKEN=replace-with-a-long-random-token
```

### File: `docker-compose.yml`

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: simpleoj
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5433:5432"
    volumes:
      - simpleoj_pg:/var/lib/postgresql/data

volumes:
  simpleoj_pg:
```

### File: `Dockerfile`

```dockerfile
FROM node:22-bookworm-slim AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./
COPY . .
ENV NODE_ENV=production PYTHON_COMMAND=python3
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.js && node scripts/seed.js && node src/server.js"]
```

### File: `docs/spec.md`

```markdown
# Product Spec: SimpleOJ

> **Status**: Active (Judge v2 Implemented)

## Judge Comparison Rules

SimpleOJ supports four distinct comparison modes to evaluate submission correctness:

1. **`exact`**: The output from the program must match the expected output exactly, character-for-character. This includes all spaces, tabs, and newlines.
2. **`trim`**: The output is stripped of leading and trailing whitespace/newlines before comparison. Any internal spacing must match exactly.
3. **`token` (Default)**: The output and expected output are tokenized by dividing them using whitespace delimiters (`/\s+/`). This ignores all variation in line endings (`\r\n` vs `\n`), trailing space, and intermediate white spaces. The token sequences must match exactly in value and length.
4. **`number`**: The outputs are tokenized just like in `token` mode. For each pair of tokens:
   - If both are valid numeric values (floats/integers), they are compared using a floating-point tolerance:
     $$\text{Difference} = |A - B| \le \text{number\_tolerance}$$
     Where the default `number_tolerance` is $1e-6$ (unless customized per problem).
   - If either token is non-numeric, the judge falls back to string value matching for that token.

## Testcase Properties

Each testcase has the following fields:
* **`input`**: The standard input provided to the program.
* **`expected_output`**: The expected standard output.
* **`weight`** (default `1`): Scoring weight. Submission score is calculated dynamically based on testcase weight:
  $$\text{Score} = \text{round}\left( \frac{\sum \text{weight}_{\text{passed}}}{\sum \text{weight}_{\text{total}}} \times 100 \right)$$
* **`is_public`** (default `false`):
  - **`true`**: The input, expected output, and actual program output are shown to the user in their submission details report.
  - **`false`**: Output values are hidden in the submission report to prevent hardcoded solutions, showing only status details (e.g., `Wrong Answer`, `Time Limit Exceeded`).
```

### File: `migrations/001_initial.sql`

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('ADMIN', 'STUDENT')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS problems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'Dễ',
  description TEXT NOT NULL,
  starter_code TEXT NOT NULL DEFAULT '',
  examples JSONB NOT NULL DEFAULT '[]'::jsonb,
  testcases JSONB NOT NULL DEFAULT '[]'::jsonb,
  time_limit_minutes INTEGER NOT NULL DEFAULT 30 CHECK (time_limit_minutes BETWEEN 1 AND 240),
  execution_limit_ms INTEGER NOT NULL DEFAULT 1500 CHECK (execution_limit_ms BETWEEN 250 AND 5000),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'EXPIRED'))
);

CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  attempt_id UUID REFERENCES attempts(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACCEPTED', 'WRONG_ANSWER', 'RUNTIME_ERROR', 'TIME_LIMIT', 'EXPIRED')),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  passed_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  report JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attempts_user_problem ON attempts(user_id, problem_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_problem ON submissions(problem_id, score DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### File: `migrations/002_add_limits_status.sql`

```sql
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_status_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_status_check CHECK (status IN ('ACCEPTED', 'WRONG_ANSWER', 'RUNTIME_ERROR', 'TIME_LIMIT', 'EXPIRED', 'OUTPUT_LIMIT', 'MEMORY_LIMIT'));
```

### File: `migrations/003_advanced_features.sql`

```sql
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
```

### File: `migrations/004_codeforces_rating.sql`

```sql
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
```

### File: `migrations/005_sync_progress.sql`

```sql
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
```

### File: `migrations/006_student_problem_assignments.sql`

```sql
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
```

### File: `migrations/007_compare_mode.sql`

```sql
ALTER TABLE problems ADD COLUMN IF NOT EXISTS compare_mode TEXT NOT NULL DEFAULT 'token' CHECK (compare_mode IN ('exact', 'trim', 'token', 'number'));
ALTER TABLE problems ADD COLUMN IF NOT EXISTS number_tolerance DOUBLE PRECISION NOT NULL DEFAULT 1e-6;
```

### File: `package.json`

```json
{
  "name": "simpleoj",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js",
    "db:migrate": "node scripts/migrate.js",
    "db:seed": "node scripts/seed.js",
    "test": "node --test"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@xterm/addon-fit": "^0.11.0",
    "@xterm/xterm": "^6.0.0",
    "cookie-parser": "^1.4.7",
    "dotenv": "^16.5.0",
    "express": "^5.1.0",
    "express-rate-limit": "^7.5.0",
    "helmet": "^8.1.0",
    "jsonwebtoken": "^9.0.2",
    "monaco-editor": "^0.52.2",
    "pg": "^8.16.0",
    "ws": "^8.21.0"
  },
  "optionalDependencies": {
    "node-pty": "^1.1.0"
  }
}
```

### File: `problems.json`

```json
[
  {
    "id": "sum",
    "title": "Bài 1: Tính tổng hai số",
    "difficulty": "Dễ",
    "description": "Viết chương trình nhập vào hai số nguyên $a$ và $b$ (cách nhau bởi một khoảng trắng) từ bàn phím. In ra màn hình tổng của hai số đó.\n\n### Định dạng dữ liệu đầu vào:\n* Một dòng duy nhất chứa hai số nguyên $a$ và $b$ ($-10^9 \\le a, b \\le 10^9$).\n\n### Định dạng dữ liệu đầu ra:\n* In ra một số nguyên duy nhất là tổng của $a$ và $b$.",
    "examples": [
      {
        "input": "3 5",
        "output": "8",
        "explanation": "Tổng của 3 và 5 là 8."
      },
      {
        "input": "-2 10",
        "output": "8",
        "explanation": "Tổng của -2 và 10 là 8."
      }
    ],
    "testcases": [
      { "input": "3 5", "output": "8" },
      { "input": "-2 10", "output": "8" },
      { "input": "0 0", "output": "0" },
      { "input": "999999 1", "output": "1000000" },
      { "input": "-100 -200", "output": "-300" }
    ],
    "template": "# Nhập dữ liệu đầu vào và chuyển thành số nguyên\na, b = map(int, input().split())\n\n# Tính toán và in kết quả\nprint(a + b)\n"
  },
  {
    "id": "watermelon",
    "title": "Bài 2: Chia dưa hấu (Watermelon)",
    "difficulty": "800 (Codeforces)",
    "description": "Pete và Billy mua được một quả dưa hấu nặng $w$ kg. Họ rất thích các số chẵn và muốn chia quả dưa hấu này thành **hai phần đều có cân nặng là số chẵn dương** (không nhất thiết phải bằng nhau). \n\nHãy giúp họ kiểm tra xem có thể chia như vậy được không. Nếu có in ra `YES`, ngược lại in ra `NO`.\n\n### Định dạng dữ liệu đầu vào:\n* Một dòng duy nhất chứa số nguyên $w$ ($1 \\le w \\le 100$) — cân nặng của quả dưa hấu.\n\n### Định dạng dữ liệu đầu ra:\n* In ra `YES` nếu có thể chia quả dưa thành hai phần có số cân là số chẵn dương. Ngược lại, in ra `NO`.",
    "examples": [
      {
        "input": "8",
        "output": "YES",
        "explanation": "Quả dưa hấu nặng 8kg có thể chia thành hai phần nặng 2kg và 6kg (hoặc 4kg và 4kg)."
      },
      {
        "input": "2",
        "output": "NO",
        "explanation": "Quả dưa hấu nặng 2kg chỉ có thể chia thành hai phần là 1kg và 1kg. Mà số 1 không phải số chẵn, nên kết quả là NO."
      }
    ],
    "testcases": [
      { "input": "8", "output": "YES" },
      { "input": "2", "output": "NO" },
      { "input": "3", "output": "NO" },
      { "input": "100", "output": "YES" },
      { "input": "4", "output": "YES" }
    ],
    "template": "# Nhập cân nặng w của quả dưa\nw = int(input())\n\n# Hãy viết code kiểm tra ở đây\n"
  },
  {
    "id": "case_count",
    "title": "Bài 3: Đếm chữ Hoa - chữ Thường",
    "difficulty": "Dễ - Trung bình",
    "description": "Viết chương trình nhập vào một chuỗi ký tự $S$ gồm cả chữ hoa, chữ thường và chữ số. Hãy đếm xem có bao nhiêu chữ cái viết hoa và bao nhiêu chữ cái viết thường xuất hiện trong chuỗi.\n\n### Định dạng dữ liệu đầu vào:\n* Một dòng duy nhất chứa chuỗi ký tự $S$ (độ dài không quá 100 ký tự).\n\n### Định dạng dữ liệu đầu ra:\n* Một dòng chứa hai số nguyên cách nhau bởi khoảng trắng: Số lượng chữ cái viết hoa và số lượng chữ cái viết thường.",
    "examples": [
      {
        "input": "CodeForces",
        "output": "2 8",
        "explanation": "Chuỗi 'CodeForces' có 2 chữ hoa ('C', 'F') và 8 chữ thường ('o', 'd', 'e', 'o', 'r', 'c', 'e', 's')."
      },
      {
        "input": "Python3.10",
        "output": "1 5",
        "explanation": "Chuỗi 'Python3.10' có 1 chữ hoa ('P') và 5 chữ thường ('y', 't', 'h', 'o', 'n'). Các chữ số và dấu chấm không được đếm."
      }
    ],
    "testcases": [
      { "input": "CodeForces", "output": "2 8" },
      { "input": "Python3.10", "output": "1 5" },
      { "input": "HELLO", "output": "5 0" },
      { "input": "world", "output": "0 5" },
      { "input": "123456", "output": "0 0" }
    ],
    "template": "# Nhập chuỗi ký tự\ns = input()\n\n# Hãy đếm chữ hoa và chữ thường rồi in ra kết quả\n"
  }
]
```

### File: `public/index.html`

```html
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="SimpleOJ — phòng luyện lập trình Python cho lớp học.">
  <title>SimpleOJ · Phòng luyện Python</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://cdnjs.cloudflare.com">
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" crossorigin>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css" crossorigin>
  <link rel="stylesheet" href="/vendor/xterm/css/xterm.css">
  <link rel="stylesheet" href="/styles.css?v=2.0.1">
</head>
<body>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <div id="app"><div class="boot"><span class="boot-mark">S/</span><p>Đang mở phòng học…</p></div></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.1/marked.min.js" crossorigin></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js" crossorigin></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js" crossorigin></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/loader.js" crossorigin></script>
  <script type="module" src="/app.js?v=2.0.1"></script>
</body>
</html>
```

### File: `render.yaml`

```yaml
services:
  - type: web
    name: simpleoj
    runtime: docker
    plan: free
    healthCheckPath: /api/health
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: DATABASE_SSL
        value: "true"
      - key: JWT_SECRET
        generateValue: true
      - key: ADMIN_EMAIL
        sync: false
      - key: ADMIN_PASSWORD
        sync: false
      - key: ADMIN_NAME
        value: Quản trị viên
      - key: JUDGE_SERVICE_TOKEN
        generateValue: true
      - key: TERMINAL_PROCESS_TIMEOUT_MS
        value: "60000"
      - key: TERMINAL_SESSION_TIMEOUT_MS
        value: "600000"
      - key: TERMINAL_MAX_OUTPUT_BYTES
        value: "100000"
```

### File: `scripts/migrate.js`

```javascript
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const directory = path.join(root, 'migrations');
const files = (await fs.readdir(directory)).filter((name) => name.endsWith('.sql')).sort();

await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
for (const filename of files) {
  const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename]);
  if (exists.rowCount) continue;
  const sql = await fs.readFile(path.join(directory, filename), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(filename) VALUES ($1) ON CONFLICT DO NOTHING', [filename]);
    await client.query('COMMIT');
    console.log(`Applied ${filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
await pool.end();
```

### File: `scripts/seed.js`

```javascript
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { pool, transaction } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import { normalizeProblem } from '../src/validation.js';
import { codeforcesViProblems } from '../src/codeforces-vi-problems.js';

const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';
const name = process.env.ADMIN_NAME || 'Quản trị viên';

if (email && password) {
  await pool.query(
    `INSERT INTO users(email, password_hash, full_name, role)
     VALUES ($1, $2, $3, 'ADMIN')
     ON CONFLICT(email) DO UPDATE SET role = 'ADMIN', is_active = TRUE`,
    [email, hashPassword(password), name]
  );
  console.log(`Admin ready: ${email}`);
} else {
  console.log('Skip admin seed: set ADMIN_EMAIL and ADMIN_PASSWORD.');
}

async function insertMissingProblems(items, createdBy) {
  let inserted = 0;
  await transaction(async (client) => {
    for (const raw of items) {
      const p = normalizeProblem({
        ...raw,
        slug: raw.slug ?? raw.id,
        timeLimitMinutes: raw.timeLimitMinutes ?? raw.time_limit_minutes ?? 30,
        executionLimitMs: raw.executionLimitMs ?? raw.execution_limit_ms ?? 1500
      });
      const { rows } = await client.query(
        `INSERT INTO problems(slug,title,difficulty,rating,max_score,passing_score,published_at,source,order_index,description,starter_code,examples,time_limit_minutes,execution_limit_ms,is_active,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16)
         ON CONFLICT(slug) DO NOTHING
         RETURNING id`,
        [p.slug, p.title, p.difficulty, p.rating, p.maxScore, p.passingScore, p.publishedAt, p.source, p.orderIndex,
          p.description, p.starterCode, JSON.stringify(p.examples), p.timeLimitMinutes, p.executionLimitMs, p.isActive, createdBy]
      );
      const problemId = rows[0]?.id;
      if (!problemId) continue;
      inserted += 1;
      for (const tc of p.testcases) {
        await client.query(
          `INSERT INTO problem_testcases(problem_id, input, expected_output, explanation, is_public, weight, order_index)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [problemId, tc.input, tc.output, tc.explanation, tc.isPublic, tc.weight, tc.orderIndex]
        );
      }
    }
  });
  return inserted;
}

const count = await pool.query('SELECT COUNT(*)::int AS count FROM problems');
const admin = await pool.query("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1");
if (count.rows[0].count === 0) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const source = JSON.parse(await fs.readFile(path.join(root, 'problems.json'), 'utf8'));
  const inserted = await insertMissingProblems(source.map((raw) => ({ ...raw, slug: raw.id, timeLimitMinutes: 30, executionLimitMs: 1500 })), admin.rows[0]?.id || null);
  console.log(`Seeded ${inserted} starter problems.`);
}

const codeforcesInserted = await insertMissingProblems(codeforcesViProblems, admin.rows[0]?.id || null);
console.log(`Seeded ${codeforcesInserted} Codeforces problems.`);

await pool.end();
```

### File: `src/auth.js`

```javascript
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';

const COOKIE_NAME = 'simpleoj_session';

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, expectedHex] = String(stored).split(':');
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function setSession(res, user) {
  const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: '7d' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export async function optionalAuth(req, _res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return next();
    const payload = jwt.verify(token, config.jwtSecret);
    const { rows } = await query(
      'SELECT id, email, full_name, role, is_active, created_at FROM users WHERE id = $1',
      [payload.sub]
    );
    if (rows[0]?.is_active) req.user = rows[0];
    next();
  } catch {
    next();
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Bạn cần đăng nhập.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Bạn cần đăng nhập.' });
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Chỉ quản trị viên được phép.' });
  next();
}

export function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}
```

### File: `src/codeforces-vi-problems.js`

```javascript
export const codeforcesViProblems = [
  {
    slug: 'cf-4a-watermelon',
    title: 'Bài 1: Chia dưa hấu',
    difficulty: 'Dễ',
    rating: 800,
    description: `Cho trọng lượng w của một quả dưa hấu. Hãy kiểm tra xem có thể chia w thành hai phần nguyên dương, và cả hai phần đều có cân nặng chẵn hay không.

### Định dạng dữ liệu đầu vào:
* Một số nguyên w, 1 <= w <= 100.

### Định dạng dữ liệu đầu ra:
* In YES nếu chia được, ngược lại in NO.`,
    examples: [
      {
        input: '8',
        output: 'YES',
        explanation: 'Có thể chia thành 2 và 6.'
      }
    ],
    testcases: [
      { input: '8', output: 'YES' },
      { input: '2', output: 'NO' },
      { input: '3', output: 'NO' },
      { input: '100', output: 'YES' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1000,
    isActive: true,
    source: 'Codeforces 4A - Watermelon',
    orderIndex: 1
  },
  {
    slug: 'cf-9a-die-roll',
    title: 'Bài 2: Xác suất của Dot',
    difficulty: 'Dễ',
    rating: 800,
    description: `Yakko và Wakko đã tung xúc xắc và nhận được lần lượt Y và W điểm. Dot sẽ thắng nếu số của cô ấy không nhỏ hơn cả hai người kia, vì nếu bằng điểm thì Dot vẫn được tính là thắng.

Hãy in xác suất Dot chiến thắng dưới dạng phân số tối giản A/B. Nếu xác suất bằng 0 hãy in 0/1, nếu bằng 1 hãy in 1/1.

### Định dạng dữ liệu đầu vào:
* Một dòng chứa hai số nguyên Y và W.

### Định dạng dữ liệu đầu ra:
* In ra phân số tối giản biểu diễn xác suất Dot thắng.`,
    examples: [
      {
        input: '4 2',
        output: '1/2',
        explanation: 'Dot thắng nếu tung được 4, 5 hoặc 6.'
      }
    ],
    testcases: [
      { input: '4 2', output: '1/2' },
      { input: '3 3', output: '2/3' },
      { input: '6 6', output: '1/6' },
      { input: '1 1', output: '1/1' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1000,
    isActive: true,
    source: 'Codeforces 9A - Die Roll',
    orderIndex: 2
  },
  {
    slug: 'cf-32b-borze',
    title: 'Bài 3: Giải mã Borze',
    difficulty: 'Dễ',
    rating: 800,
    description: `Mã Borze dùng chuỗi ký hiệu . , -. và -- để biểu diễn số ở hệ tam phân. Quy ước là:
* . tương ứng với 0
* -. tương ứng với 1
* -- tương ứng với 2

Hãy giải mã chuỗi Borze đã cho.

### Định dạng dữ liệu đầu vào:
* Một chuỗi Borze hợp lệ.

### Định dạng dữ liệu đầu ra:
* In ra số tam phân tương ứng.`,
    examples: [
      {
        input: '.-.--',
        output: '012',
        explanation: 'Chuỗi được đọc lần lượt thành 0, 1, 2.'
      }
    ],
    testcases: [
      { input: '.-.--', output: '012' },
      { input: '--.', output: '20' },
      { input: '.', output: '0' },
      { input: '-..-.--', output: '1012' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1000,
    isActive: true,
    source: 'Codeforces 32B - Borze',
    orderIndex: 3
  },
  {
    slug: 'cf-38a-army',
    title: 'Bài 4: Quân hàm và số năm',
    difficulty: 'Dễ',
    rating: 800,
    description: `Hệ thống quân hàm của Berland có n bậc, đánh số từ 1 đến n. Để đi từ bậc i lên bậc i + 1 cần d_i năm. Vasya vừa đạt bậc a và muốn lên bậc b.

Hãy tính tổng số năm Vasya còn phải phục vụ.

### Định dạng dữ liệu đầu vào:
* Dòng 1 chứa n.
* Dòng 2 chứa n - 1 số nguyên d_i.
* Dòng 3 chứa hai số nguyên a và b.

### Định dạng dữ liệu đầu ra:
* In ra số năm cần thiết để đi từ a lên b.`,
    examples: [
      {
        input: '3\n5 6\n1 2',
        output: '5',
        explanation: 'Từ bậc 1 lên bậc 2 mất 5 năm.'
      }
    ],
    testcases: [
      { input: '3\n5 6\n1 3', output: '11' },
      { input: '4\n1 2 3\n2 4', output: '5' },
      { input: '5\n1 2 3 4\n1 5', output: '10' },
      { input: '2\n7\n1 2', output: '7' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1000,
    isActive: true,
    source: 'Codeforces 38A - Army',
    orderIndex: 4
  },
  {
    slug: 'cf-41a-translation',
    title: 'Bài 5: Dịch ngược một từ',
    difficulty: 'Dễ',
    rating: 800,
    description: `Trong ngôn ngữ Berland và Birland, một từ có nghĩa giống nhau nếu nó bị viết ngược lại. Ví dụ code tương ứng với edoc.

Hãy kiểm tra xem từ t có phải là từ s viết ngược hay không.

### Định dạng dữ liệu đầu vào:
* Dòng 1 chứa từ s.
* Dòng 2 chứa từ t.

### Định dạng dữ liệu đầu ra:
* In YES nếu t là s viết ngược, ngược lại in NO.`,
    examples: [
      {
        input: 'code\nedoc',
        output: 'YES',
        explanation: 'edoc là code viết ngược.'
      }
    ],
    testcases: [
      { input: 'code\nedoc', output: 'YES' },
      { input: 'abb\naba', output: 'NO' },
      { input: 'abc\ncba', output: 'YES' },
      { input: 'code\ncode', output: 'NO' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1000,
    isActive: true,
    source: 'Codeforces 41A - Translation',
    orderIndex: 5
  },
  {
    slug: 'cf-59a-word',
    title: 'Bài 6: Chuẩn hóa chữ hoa/thường',
    difficulty: 'Dễ',
    rating: 800,
    description: `Vasya muốn chuẩn hóa một từ sao cho toàn bộ ký tự đều là chữ thường hoặc toàn bộ là chữ hoa. Nếu số chữ hoa nhiều hơn số chữ thường thì đổi cả từ sang chữ hoa, ngược lại đổi sang chữ thường. Nếu hai bên bằng nhau thì cũng đổi sang chữ thường.

### Định dạng dữ liệu đầu vào:
* Một từ chỉ gồm chữ cái Latin hoa và thường.

### Định dạng dữ liệu đầu ra:
* In ra từ sau khi đã chuẩn hóa.`,
    examples: [
      {
        input: 'HoUse',
        output: 'house',
        explanation: 'Số chữ thường nhiều hơn nên đổi sang chữ thường.'
      }
    ],
    testcases: [
      { input: 'HoUse', output: 'house' },
      { input: 'ViP', output: 'VIP' },
      { input: 'maTRIx', output: 'matrix' },
      { input: 'abCD', output: 'abcd' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1000,
    isActive: true,
    source: 'Codeforces 59A - Word',
    orderIndex: 6
  },
  {
    slug: 'cf-6a-triangle',
    title: 'Bài 7: Tam giác, đoạn thẳng hay bất khả thi',
    difficulty: 'Dễ - Trung bình',
    rating: 900,
    description: `Cho bốn thanh gỗ có độ dài khác nhau. Hãy chọn đúng ba thanh để xem có thể tạo thành:
* TRIANGLE nếu tạo được tam giác không suy biến.
* SEGMENT nếu không tạo được tam giác không suy biến nhưng tạo được tam giác suy biến.
* IMPOSSIBLE nếu không thể tạo thành bất kỳ tam giác nào.

### Định dạng dữ liệu đầu vào:
* Một dòng gồm bốn số nguyên dương.

### Định dạng dữ liệu đầu ra:
* In TRIANGLE, SEGMENT hoặc IMPOSSIBLE.`,
    examples: [
      {
        input: '4 2 1 3',
        output: 'TRIANGLE',
        explanation: 'Chọn 4, 2 và 3 thì có thể tạo tam giác.'
      }
    ],
    testcases: [
      { input: '4 2 1 3', output: 'TRIANGLE' },
      { input: '7 2 2 4', output: 'SEGMENT' },
      { input: '3 5 9 1', output: 'IMPOSSIBLE' },
      { input: '5 5 5 8', output: 'TRIANGLE' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1500,
    isActive: true,
    source: 'Codeforces 6A - Triangle',
    orderIndex: 7
  },
  {
    slug: 'cf-26a-almost-prime',
    title: 'Bài 8: Đếm số gần nguyên tố',
    difficulty: 'Dễ - Trung bình',
    rating: 900,
    description: `Một số được gọi là gần nguyên tố nếu nó có đúng hai ước nguyên tố phân biệt. Ví dụ 6, 18 và 24 là gần nguyên tố, còn 4, 8, 9, 42 thì không.

Hãy đếm xem có bao nhiêu số gần nguyên tố trong đoạn từ 1 đến n, kể cả hai đầu mút.

### Định dạng dữ liệu đầu vào:
* Một số nguyên n, 1 <= n <= 3000.

### Định dạng dữ liệu đầu ra:
* In ra số lượng số gần nguyên tố từ 1 đến n.`,
    examples: [
      {
        input: '10',
        output: '2',
        explanation: 'Các số gần nguyên tố không vượt quá 10 là 6 và 10.'
      }
    ],
    testcases: [
      { input: '1', output: '0' },
      { input: '10', output: '2' },
      { input: '21', output: '8' },
      { input: '30', output: '12' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1500,
    isActive: true,
    source: 'Codeforces 26A - Almost Prime',
    orderIndex: 8
  },
  {
    slug: 'cf-96a-football',
    title: 'Bài 9: Tình huống bóng đá nguy hiểm',
    difficulty: 'Dễ - Trung bình',
    rating: 900,
    description: `Petya biểu diễn trạng thái trận bóng bằng một chuỗi chỉ gồm 0 và 1. Nếu tồn tại ít nhất 7 ký tự giống nhau đứng liên tiếp thì trạng thái đó được coi là nguy hiểm.

Hãy xác định xem trạng thái hiện tại có nguy hiểm hay không.

### Định dạng dữ liệu đầu vào:
* Một chuỗi không rỗng chỉ gồm ký tự 0 và 1.

### Định dạng dữ liệu đầu ra:
* In YES nếu trạng thái nguy hiểm, ngược lại in NO.`,
    examples: [
      {
        input: '001001',
        output: 'NO',
        explanation: 'Không có đoạn nào dài tới 7 ký tự giống nhau.'
      }
    ],
    testcases: [
      { input: '001001', output: 'NO' },
      { input: '1000000001', output: 'YES' },
      { input: '1111111', output: 'YES' },
      { input: '0101010', output: 'NO' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1500,
    isActive: true,
    source: 'Codeforces 96A - Football',
    orderIndex: 9
  },
  {
    slug: 'cf-11a-increasing-sequence',
    title: 'Bài 10: Làm dãy tăng dần',
    difficulty: 'Dễ - Trung bình',
    rating: 900,
    description: `Cho một dãy b gồm n phần tử và một số dương d. Trong mỗi bước, bạn được chọn một phần tử bất kỳ và cộng thêm d vào nó. Hãy tìm số bước ít nhất để biến dãy thành dãy tăng nghiêm ngặt.

### Định dạng dữ liệu đầu vào:
* Dòng 1 chứa n và d.
* Dòng 2 chứa dãy b gồm n số nguyên.

### Định dạng dữ liệu đầu ra:
* In ra số bước nhỏ nhất cần thực hiện.`,
    examples: [
      {
        input: '4 2\n1 3 3 2',
        output: '3',
        explanation: 'Có thể tăng phần tử thứ 3 và thứ 4 để thu được dãy tăng.'
      }
    ],
    testcases: [
      { input: '4 2\n1 3 3 2', output: '3' },
      { input: '2 1\n4 1', output: '4' },
      { input: '3 5\n10 10 10', output: '3' },
      { input: '4 10\n1 2 3 4', output: '0' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1000,
    isActive: true,
    source: 'Codeforces 11A - Increasing Sequence',
    orderIndex: 10
  }
];
```

### File: `src/config.js`

```javascript
import 'dotenv/config';

const requiredInProduction = ['DATABASE_URL', 'JWT_SECRET'];
if (process.env.NODE_ENV === 'production') {
  for (const key of requiredInProduction) {
    if (!process.env[key]) throw new Error(`Thiếu biến môi trường ${key}`);
  }
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/simpleoj',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  jwtSecret: process.env.JWT_SECRET || 'development-only-secret-change-before-deploy',
  pythonCommand: process.env.PYTHON_COMMAND || (process.platform === 'win32' ? 'python' : 'python3'),
  judgeServiceUrl: process.env.JUDGE_SERVICE_URL || '',
  judgeServiceToken: process.env.JUDGE_SERVICE_TOKEN || '',
  isProduction: process.env.NODE_ENV === 'production',
  maxGlobalPythonProcesses: Number(process.env.MAX_GLOBAL_PYTHON_PROCESSES || 5),
  pythonRunningTimeoutMs: Number(process.env.PYTHON_RUNNING_TIMEOUT_MS || 10000),
  pythonInputTimeoutMs: Number(process.env.PYTHON_INPUT_TIMEOUT_MS || 90000),
  pythonTotalTimeoutMs: Number(process.env.PYTHON_TOTAL_TIMEOUT_MS || 180000),
  terminalOutputLimitBytes: Number(process.env.TERMINAL_OUTPUT_LIMIT_BYTES || 262144), // 256KB
  terminalRunner: process.env.TERMINAL_RUNNER || 'client',
  serverTerminalEnabled: process.env.SERVER_TERMINAL_ENABLED === 'true'
};
```

### File: `src/db.js`

```javascript
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;
export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: config.isProduction ? 10 : 5
});

export const query = (text, params) => pool.query(text, params);

export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### File: `src/judge.js`

```javascript
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const runnerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'python-runner.py');

function normalizeOutput(value) {
  return String(value ?? '').replace(/\r\n/g, '\n');
}

export async function runPythonLocal(code, input, limitMs = 1500) {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'simpleoj-'));
  const dropPrivileges = process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() === 0;
  if (dropPrivileges) await fs.chown(workdir, 65534, 65534);
  return new Promise((resolve) => {
    const child = spawn(config.pythonCommand, ['-I', runnerPath], {
      cwd: workdir,
      env: { PYTHONIOENCODING: 'utf-8', PATH: process.env.PATH || '' },
      ...(dropPrivileges ? { uid: 65534, gid: 65534 } : {}),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fs.rm(workdir, { recursive: true, force: true }).catch(() => {}).finally(() => resolve(result));
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ output: '', error: `Quá thời gian chạy (${limitMs} ms).`, timedOut: true });
    }, limitMs + 400);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > 50000) child.kill('SIGKILL');
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      console.error('Python runner spawn failed:', error);
      finish({ output: '', error: 'Runner error: không thể khởi động môi trường chạy Python' });
    });
    child.on('close', () => {
      if (settled) return;
      try {
        finish(JSON.parse(stdout));
      } catch (err) {
        console.error('Python runner did not return valid JSON. stderr:', stderr, 'error:', err);
        finish({ output: '', error: 'Runner error: không thể khởi động môi trường chạy Python' });
      }
    });
    child.stdin.end(JSON.stringify({ code, input, limitMs }));
  });
}

async function runRemote(code, testcases, limitMs, options = {}) {
  const response = await fetch(`${config.judgeServiceUrl.replace(/\/$/, '')}/internal/judge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.judgeServiceToken}` },
    body: JSON.stringify({ code, testcases, limitMs, options }),
    signal: AbortSignal.timeout(Math.max(10000, testcases.length * (limitMs + 1000)))
  });
  if (!response.ok) throw new Error(`Judge service trả về ${response.status}`);
  return response.json();
}


export function parseRunnerError(result, limitMs) {
  if (result.timedOut) {
    return {
      type: 'TIME_LIMIT_EXCEEDED',
      status: 'Time Limit Exceeded',
      message: 'chương trình chạy quá thời gian cho phép',
      traceback: '',
      line: null,
      safeForUser: true
    };
  }

  if (result.truncated) {
    return {
      type: 'OUTPUT_LIMIT_EXCEEDED',
      status: 'Output Limit Exceeded',
      message: 'chương trình in quá nhiều dữ liệu',
      traceback: '',
      line: null,
      safeForUser: true
    };
  }

  if (result.error) {
    const errStr = String(result.error);
    
    if (errStr.includes('[Blocked import:')) {
      const match = errStr.match(/\[Blocked import:\s*([^\]]+)\]/);
      const mod = match ? match[1] : '';
      return {
        type: 'BLOCKED_IMPORT_OR_OPERATION',
        status: 'Runtime Error',
        message: `Blocked import: ${mod}. Module này không được phép trong môi trường SimpleOJ.`,
        traceback: errStr,
        line: null,
        safeForUser: true
      };
    }

    if (errStr.includes('EOFError')) {
      return {
        type: 'USER_CODE_INPUT_ERROR',
        status: 'Runtime Error',
        message: 'chương trình đã đọc quá nhiều dữ liệu đầu vào hoặc testcase thiếu input',
        traceback: errStr,
        line: getLineNumberFromTraceback(errStr),
        safeForUser: true
      };
    }

    if (errStr.includes('MemoryError')) {
      return {
        type: 'MEMORY_LIMIT_EXCEEDED',
        status: 'Memory Limit Exceeded',
        message: 'chương trình dùng quá nhiều bộ nhớ',
        traceback: errStr,
        line: getLineNumberFromTraceback(errStr),
        safeForUser: true
      };
    }

    if (errStr.includes('SyntaxError') || errStr.includes('IndentationError') || errStr.includes('TabError')) {
      return {
        type: 'USER_CODE_SYNTAX_ERROR',
        status: 'Runtime Error',
        message: getErrorMessage(errStr),
        traceback: errStr,
        line: getLineNumberFromTraceback(errStr),
        safeForUser: true
      };
    }

    if (errStr.includes('Runner error:')) {
      return {
        type: 'RUNNER_SYSTEM_ERROR',
        status: 'Runtime Error',
        message: 'Runner error: không thể khởi động môi trường chạy Python',
        traceback: errStr,
        line: null,
        safeForUser: false
      };
    }

    return {
      type: 'USER_CODE_RUNTIME_ERROR',
      status: 'Runtime Error',
      message: getErrorMessage(errStr),
      traceback: errStr,
      line: getLineNumberFromTraceback(errStr),
      safeForUser: true
    };
  }

  return null;
}

function getLineNumberFromTraceback(tracebackStr) {
  const match = tracebackStr.match(/File\s+"(?:submission\.py|main\.py)",\s+line\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

function getErrorMessage(tracebackStr) {
  const lines = tracebackStr.trim().split('\n');
  return lines[lines.length - 1] || 'Lỗi thực thi chương trình.';
}

function parseStrictNumber(token) {
  if (!token) return NaN;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)) {
    return NaN;
  }
  const val = Number(token);
  if (isNaN(val) || !isFinite(val)) return NaN;
  return val;
}

export function compareOutput(actualRaw, expectedRaw, options = {}) {
  const compareMode = options.compareMode || 'token';
  const numberTolerance = options.numberTolerance ?? 1e-6;

  const actual = String(actualRaw ?? '').replace(/\r\n/g, '\n');
  const expected = String(expectedRaw ?? '').replace(/\r\n/g, '\n');

  if (compareMode === 'exact') {
    return { ok: actual === expected, reason: actual === expected ? 'Khớp hoàn toàn' : 'Khác biệt ký tự hoặc khoảng trắng' };
  }

  if (compareMode === 'trim') {
    const aTrim = actual.trim();
    const eTrim = expected.trim();
    return { ok: aTrim === eTrim, reason: aTrim === eTrim ? 'Khớp sau khi trim' : 'Khác biệt nội dung' };
  }

  const getTokens = (str) => {
    return str.trim().split(/\s+/).filter(t => t.length > 0);
  };

  const actualTokens = getTokens(actual);
  const expectedTokens = getTokens(expected);

  if (compareMode === 'token') {
    if (actualTokens.length !== expectedTokens.length) {
      return { 
        ok: false, 
        reason: `Số lượng token không khớp (thực tế có ${actualTokens.length} tokens, mong muốn ${expectedTokens.length} tokens).`
      };
    }

    for (let i = 0; i < actualTokens.length; i++) {
      if (actualTokens[i] !== expectedTokens[i]) {
        return {
          ok: false,
          reason: `Token thứ ${i + 1} không khớp: thực tế là "${actualTokens[i]}", mong muốn "${expectedTokens[i]}".`
        };
      }
    }

    return { ok: true, reason: 'Khớp tokens' };
  }

  if (compareMode === 'number') {
    if (actualTokens.length !== expectedTokens.length) {
      return { 
        ok: false, 
        reason: `Số lượng token không khớp (thực tế có ${actualTokens.length} tokens, mong muốn ${expectedTokens.length} tokens).`
      };
    }

    for (let i = 0; i < actualTokens.length; i++) {
      const aToken = actualTokens[i];
      const eToken = expectedTokens[i];

      const aNum = parseStrictNumber(aToken);
      const eNum = parseStrictNumber(eToken);

      const isANum = !isNaN(aNum);
      const isENum = !isNaN(eNum);

      if (isANum && isENum) {
        if (Math.abs(aNum - eNum) > numberTolerance) {
          return {
            ok: false,
            reason: `Giá trị số tại token thứ ${i + 1} không nằm trong độ lệch cho phép (thực tế ${aNum}, mong muốn ${eNum}, độ lệch tối đa ${numberTolerance}).`
          };
        }
      } else {
        if (aToken !== eToken) {
          return {
            ok: false,
            reason: `Token thứ ${i + 1} không khớp: thực tế là "${aToken}", mong muốn "${eToken}".`
          };
        }
      }
    }

    return { ok: true, reason: 'Khớp số và ký tự' };
  }

  return { ok: false, reason: 'Không hỗ trợ compare mode.' };
}

export async function judgeSubmission(code, testcases, limitMs = 1500, forceLocal = false, options = {}) {
  if (config.judgeServiceUrl && !forceLocal) return runRemote(code, testcases, limitMs, options);
  const reports = [];
  let totalWeight = 0;
  let passedWeight = 0;
  let passedCount = 0;

  for (let index = 0; index < testcases.length; index += 1) {
    const testcase = testcases[index];
    const weight = Number(testcase.weight ?? 1);
    totalWeight += weight;

    const result = await runPythonLocal(code, testcase.input, limitMs);
    const actual = normalizeOutput(result.output);
    const expected = normalizeOutput(testcase.output);
    
    const errorModel = parseRunnerError(result, limitMs);
    const compareResult = compareOutput(actual, expected, options);
    const ok = !errorModel && compareResult.ok;
    
    if (ok) {
      passedWeight += weight;
      passedCount += 1;
    }
    
    const reportItem = {
      index: index + 1,
      passed: ok,
    };

    const isPublic = testcase.isPublic ?? testcase.is_public ?? false;
    if (isPublic) {
      reportItem.input = testcase.input;
      reportItem.expected = expected;
      reportItem.actual = actual;
    }

    if (!ok) {
      if (errorModel) {
        reportItem.status = errorModel.status;
        reportItem.errorType = errorModel.type;
        reportItem.error = errorModel.safeForUser 
          ? `${errorModel.status}: ${errorModel.message}${errorModel.line ? ` (dòng ${errorModel.line})` : ''}` 
          : 'Runner error: không thể khởi động môi trường chạy Python';
        
        if (errorModel.type === 'RUNNER_SYSTEM_ERROR') {
          console.error(`[SYSTEM_ERROR] Testcase ${index + 1} failed:`, errorModel.traceback);
        }
      } else {
        reportItem.status = 'Wrong Answer';
        reportItem.error = compareResult.reason || 'Sai đáp án (Wrong Answer)';
      }
    } else {
      reportItem.status = 'Accepted';
      reportItem.error = 'Khớp đáp án';
    }
    
    reports.push(reportItem);
  }
  const total = testcases.length;
  const score = totalWeight ? Math.round((passedWeight / totalWeight) * 100) : 0;
  return { passed: passedCount, total, score, reports };
}

```

### File: `src/python-runner.py`

```text
import contextlib
import io
import json
import os
import sys
import traceback


def apply_limits(payload):
    try:
        import resource
        memory = 192 * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
        resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
        if hasattr(resource, "RLIMIT_NPROC"):
            resource.setrlimit(resource.RLIMIT_NPROC, (8, 8))
        seconds = max(1, int(payload.get("limitMs", 1500) / 1000) + 1)
        resource.setrlimit(resource.RLIMIT_CPU, (seconds, seconds + 1))
    except (ImportError, ValueError, OSError):
        pass


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    payload = json.loads(sys.stdin.read())
    apply_limits(payload)
    
    import builtins
    _original_import = builtins.__import__
    BLOCKED_MODULES = {"os", "subprocess", "socket", "multiprocessing", "threading"}
    
    global is_running_user_code
    is_running_user_code = False

    def restricted_import(name, globals=None, locals=None, fromlist=(), level=0):
        # Check call stack to see if import is initiated by user code
        is_user_import = False
        caller_frame = sys._getframe(1)
        while caller_frame:
            filename = caller_frame.f_code.co_filename
            if filename and (filename.endswith("main.py") or filename.endswith("submission.py") or filename == "<stdin>" or filename == "<string>"):
                is_user_import = True
                break
            caller_frame = caller_frame.f_back

        if is_user_import:
            top_level_name = name.split('.')[0]
            if top_level_name in BLOCKED_MODULES:
                raise ImportError(f"[Blocked import: {top_level_name}]\nModule này không được phép trong môi trường SimpleOJ.")
        return _original_import(name, globals, locals, fromlist, level)

    builtins.__import__ = restricted_import

    output = io.StringIO()
    error = None
    old_stdin, old_stdout, old_stderr = sys.stdin, sys.stdout, sys.stderr
    sys.stdin = io.StringIO(str(payload.get("input", "")))
    sys.stdout = output
    sys.stderr = output
    
    is_running_user_code = True
    try:
        namespace = {"__name__": "__main__", "__builtins__": __builtins__}
        exec(compile(str(payload.get("code", "")), "submission.py", "exec"), namespace, namespace)
    except BaseException:
        exc_type, exc_value, exc_tb = sys.exc_info()
        tb = exc_tb
        while tb is not None:
            filename = tb.tb_frame.f_code.co_filename
            if filename and filename.endswith("submission.py"):
                break
            tb = tb.tb_next
            
        if tb is not None:
            tb_lines = traceback.format_exception(exc_type, exc_value, tb)
            if tb_lines and "Traceback" in tb_lines[0]:
                tb_lines = tb_lines[1:]
            tb_lines = [line for line in tb_lines if "python-runner.py" not in line]
            error = "Traceback (most recent call last):\n" + "".join(tb_lines)
        else:
            tb_lines = traceback.format_exception(exc_type, exc_value, exc_tb)
            tb_lines = [line for line in tb_lines if "python-runner.py" not in line]
            error = "".join(tb_lines)
    finally:
        is_running_user_code = False
        sys.stdin, sys.stdout, sys.stderr = old_stdin, old_stdout, old_stderr
    text = output.getvalue()
    result = {"output": text[:20000], "error": error, "truncated": len(text) > 20000}
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
    sys.stdout.buffer.write(b'\n')


if __name__ == "__main__":
    main()
```

### File: `src/server.js`

```javascript
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { config } from './config.js';
import { query, transaction } from './db.js';
import {
  clearSession, hashPassword, optionalAuth, requireAdmin, requireAuth,
  setSession, validatePassword, verifyPassword
} from './auth.js';
import { cleanText, normalizeEmail, normalizeProblem, validEmail, validateProblem } from './validation.js';
import { judgeSubmission, runPythonLocal } from './judge.js';
import { attachTerminalServer } from './terminal.js';

const app = express();
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginEmbedderPolicy: { policy: 'require-corp' }
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(optionalAuth);
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use('/api/run', rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));
app.use('/api/submissions', rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }));

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const ASSIGNMENT_STATUSES = new Set(['ASSIGNED', 'COMPLETED', 'CANCELLED']);

function normalizeAssignmentStatusFilter(value) {
  const normalized = String(value || 'all').toUpperCase();
  return ASSIGNMENT_STATUSES.has(normalized) ? normalized : 'all';
}

function parseUuidList(value, limit = 100) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const items = [];
  for (const entry of value) {
    const id = String(entry || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    items.push(id);
    if (items.length >= limit) break;
  }
  return items;
}

function isCompletedSubmission(score, status, passingScore) {
  return status === 'ACCEPTED' || Number(score) >= Number(passingScore);
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  let dbOk = false;
  let migrationsOk = false;
  try {
    await query('SELECT 1');
    dbOk = true;
    
    const migrationsDir = path.join(root, 'migrations');
    const files = (await fs.readdir(migrationsDir)).filter((name) => name.endsWith('.sql'));
    const { rows } = await query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map(r => r.filename));
    migrationsOk = files.every(f => applied.has(f));
  } catch (err) {
    console.error('Health check DB error:', err);
  }

  let runnerOk = false;
  try {
    const runnerPath = path.join(root, 'src', 'python-runner.py');
    await fs.access(runnerPath);
    runnerOk = true;
  } catch (err) {
    console.error('Health check runner access error:', err);
  }

  let pythonOk = false;
  if (!config.judgeServiceUrl) {
    try {
      const proc = spawn(config.pythonCommand, ['--version']);
      pythonOk = await new Promise((resolve) => {
        proc.on('error', () => resolve(false));
        proc.on('close', (code) => resolve(code === 0));
      });
    } catch (err) {
      console.error('Health check python spawn error:', err);
      pythonOk = false;
    }
  } else {
    pythonOk = true;
  }

  const ok = dbOk && migrationsOk && runnerOk && pythonOk;
  res.status(ok ? 200 : 500).json({
    ok,
    database: dbOk,
    migrations: migrationsOk,
    runner: runnerOk,
    python: pythonOk,
    judge: config.judgeServiceUrl ? 'remote' : 'local'
  });
}));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const fullName = cleanText(req.body.fullName, 100);
  if (!validEmail(email) || !fullName || !validatePassword(req.body.password)) {
    return res.status(400).json({ error: 'Thông tin không hợp lệ. Mật khẩu cần ít nhất 8 ký tự, gồm chữ và số.' });
  }
  try {
    const { rows } = await query(
      `INSERT INTO users(email, password_hash, full_name) VALUES ($1,$2,$3)
       RETURNING id,email,full_name,role,is_active,created_at`,
      [email, hashPassword(req.body.password), fullName]
    );
    setSession(res, rows[0]);
    res.status(201).json({ user: rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Email đã được sử dụng.' });
    throw error;
  }
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user || !user.is_active || !verifyPassword(req.body.password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });
  }
  setSession(res, user);
  res.json({ user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role } });
}));

app.post('/api/auth/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => res.json({ user: req.user || null }));

app.get('/api/problems', requireAuth, asyncRoute(async (req, res) => {
  const { tab, cursor, rating, minRating, maxRating, minScore, maxScore, assigned, sort, uploadedFrom, uploadedTo } = req.query;
  if (!tab) {
    const admin = req.user.role === 'ADMIN';
    const { rows } = await query(
      `SELECT p.id,p.slug,p.title,p.difficulty,p.rating,p.time_limit_minutes,p.execution_limit_ms,p.is_active,p.created_at,
         COALESCE((SELECT MAX(s.score) FROM submissions s WHERE s.problem_id=p.id AND s.user_id=$1), 0)::int AS best_score,
         CASE
           WHEN EXISTS (
             SELECT 1
             FROM student_problem_assignments spa
             WHERE spa.user_id = $1
               AND spa.problem_id = p.id
               AND spa.status = 'ASSIGNED'
           )
           AND NOT EXISTS (
             SELECT 1
             FROM user_problem_progress upp
             WHERE upp.user_id = $1
               AND upp.problem_id = p.id
               AND (upp.completed_at IS NOT NULL OR COALESCE(upp.best_score, 0) >= 100)
           )
           THEN TRUE ELSE FALSE
         END AS "isAssigned"
       FROM problems p ${admin ? '' : 'WHERE p.is_active = TRUE'} ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    return res.json({ problems: rows });
  }

  // Parse filters
  const parsedRating = rating !== undefined && rating !== '' ? Number(rating) : null;
  const parsedMinRating = minRating !== undefined && minRating !== '' ? Number(minRating) : null;
  const parsedMaxRating = maxRating !== undefined && maxRating !== '' ? Number(maxRating) : null;

  const parsedMinScore = minScore !== undefined && minScore !== '' ? Number(minScore) : null;
  const parsedMaxScore = maxScore !== undefined && maxScore !== '' ? Number(maxScore) : null;

  const queryParams = [req.user.id, req.user.role];
  const whereConditions = [];

  // Default is_active check
  whereConditions.push('(p.is_active = TRUE OR $2 = \'ADMIN\')');

  if (tab === 'done') {
    whereConditions.push('upp.user_id = $1');
    whereConditions.push('upp.completed_at IS NOT NULL');
  } else {
    // tab === 'todo'
    whereConditions.push('(upp.completed_at IS NULL OR upp.user_id IS NULL)');
  }

  // Filter rating
  if (parsedRating !== null) {
    queryParams.push(parsedRating);
    whereConditions.push(`p.rating = $${queryParams.length}`);
  }
  if (parsedMinRating !== null) {
    queryParams.push(parsedMinRating);
    whereConditions.push(`p.rating >= $${queryParams.length}`);
  }
  if (parsedMaxRating !== null) {
    queryParams.push(parsedMaxRating);
    whereConditions.push(`p.rating <= $${queryParams.length}`);
  }

  // Filter scores
  if (parsedMinScore !== null) {
    queryParams.push(parsedMinScore);
    const col = tab === 'done' ? 'COALESCE(upp.best_score, 0)' : 'p.max_score';
    whereConditions.push(`${col} >= $${queryParams.length}`);
  }
  if (parsedMaxScore !== null) {
    queryParams.push(parsedMaxScore);
    const col = tab === 'done' ? 'COALESCE(upp.best_score, 0)' : 'p.max_score';
    whereConditions.push(`${col} <= $${queryParams.length}`);
  }

  // Filter date
  if (uploadedFrom) {
    queryParams.push(new Date(uploadedFrom).toISOString());
    whereConditions.push(`p.published_at >= $${queryParams.length}`);
  }
  if (uploadedTo) {
    queryParams.push(new Date(uploadedTo).toISOString());
    whereConditions.push(`p.published_at <= $${queryParams.length}`);
  }

  // Determine sort parameters
  let sortField = '';
  let sortOrder = 'DESC'; // 'DESC' or 'ASC'
  let jsFieldName = '';

  if (tab === 'done') {
    if (sort === 'newest') {
      sortField = 'p.published_at';
      jsFieldName = 'publishedAt';
    } else if (sort === 'oldest') {
      sortField = 'p.published_at';
      sortOrder = 'ASC';
      jsFieldName = 'publishedAt';
    } else if (sort === 'rating_desc') {
      sortField = 'p.rating';
      jsFieldName = 'rating';
    } else if (sort === 'rating_asc') {
      sortField = 'p.rating';
      sortOrder = 'ASC';
      jsFieldName = 'rating';
    } else if (sort === 'score_desc') {
      sortField = 'COALESCE(upp.best_score, 0)';
      jsFieldName = 'bestScore';
    } else if (sort === 'score_asc') {
      sortField = 'COALESCE(upp.best_score, 0)';
      sortOrder = 'ASC';
      jsFieldName = 'bestScore';
    } else {
      sortField = 'upp.completed_at';
      jsFieldName = 'completedAt';
    }
  } else {
    // tab === 'todo'
    if (sort === 'newest') {
      sortField = 'p.published_at';
      jsFieldName = 'publishedAt';
    } else if (sort === 'oldest') {
      sortField = 'p.published_at';
      sortOrder = 'ASC';
      jsFieldName = 'publishedAt';
    } else if (sort === 'rating_desc') {
      sortField = 'p.rating';
      jsFieldName = 'rating';
    } else if (sort === 'rating_asc') {
      sortField = 'p.rating';
      sortOrder = 'ASC';
      jsFieldName = 'rating';
    } else if (sort === 'score_desc') {
      sortField = 'p.max_score';
      jsFieldName = 'maxScore';
    } else if (sort === 'score_asc') {
      sortField = 'p.max_score';
      sortOrder = 'ASC';
      jsFieldName = 'maxScore';
    } else {
      sortField = 'p.published_at';
      jsFieldName = 'publishedAt';
    }
  }

  // Filter assigned
  if (assigned === 'only') {
    whereConditions.push('aa.problem_id IS NOT NULL AND NOT (upp.completed_at IS NOT NULL OR COALESCE(upp.best_score, 0) >= 100)');
  } else if (assigned === 'free') {
    whereConditions.push('aa.problem_id IS NULL');
  }

  // Cursor handling
  if (cursor) {
    try {
      const { val, id } = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
      if (val !== undefined && id) {
        queryParams.push(val);
        const valPlaceholder = `$${queryParams.length}`;
        queryParams.push(id);
        const idPlaceholder = `$${queryParams.length}`;
        
        const op = sortOrder === 'DESC' ? '<' : '>';
        const isDate = (sortField === 'p.published_at' || sortField === 'upp.completed_at');
        const castedVal = isDate ? `(${valPlaceholder}::timestamptz)` : valPlaceholder;
        
        whereConditions.push(
          `(${sortField} ${op} ${castedVal} OR (${sortField} = ${castedVal} AND p.id ${op} ${idPlaceholder}))`
        );
      }
    } catch (err) {
      console.error('Failed to parse cursor:', err);
    }
  }

  const limit = Math.min(20, Math.max(1, Number(req.query.limit || 10)));
  queryParams.push(limit + 1);
  const limitPlaceholder = `$${queryParams.length}`;

  const querySql = `
    WITH active_assignments AS (
      SELECT DISTINCT pa.problem_id
      FROM student_problem_assignments pa
      WHERE pa.user_id = $1 AND pa.status = 'ASSIGNED'
    )
    SELECT
      p.id,
      p.slug,
      p.title,
      p.difficulty,
      p.rating,
      p.max_score AS "maxScore",
      p.passing_score AS "passingScore",
      COALESCE(upp.best_score, 0)::int AS "bestScore",
      upp.best_status AS "bestStatus",
      CASE WHEN upp.completed_at IS NOT NULL THEN TRUE ELSE FALSE END AS "isCompleted",
      CASE WHEN aa.problem_id IS NOT NULL AND NOT (upp.completed_at IS NOT NULL OR COALESCE(upp.best_score, 0) >= 100) THEN TRUE ELSE FALSE END AS "isAssigned",
      p.published_at AS "publishedAt",
      upp.last_submitted_at AS "lastSubmittedAt",
      upp.completed_at AS "completedAt",
      p.time_limit_minutes AS "timeLimitMinutes"
    FROM ${tab === 'done' ? 'user_problem_progress upp JOIN problems p ON p.id = upp.problem_id' : 'problems p LEFT JOIN user_problem_progress upp ON upp.problem_id = p.id AND upp.user_id = $1'}
    LEFT JOIN active_assignments aa ON aa.problem_id = p.id
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY ${sortField} ${sortOrder}, p.id ${sortOrder}
    LIMIT ${limitPlaceholder}
  `;

  const { rows } = await query(querySql, queryParams);
  const hasMore = rows.length > limit;
  const rawItems = hasMore ? rows.slice(0, limit) : rows;

  function getRatingLabel(r) {
    if (r >= 800 && r <= 1000) return 'Cơ bản';
    if (r >= 1100 && r <= 1300) return 'Dễ';
    if (r >= 1400 && r <= 1600) return 'Trung bình';
    if (r >= 1700 && r <= 1900) return 'Khó';
    return 'Nâng cao';
  }

  const items = rawItems.map((item) => ({
    ...item,
    ratingLabel: getRatingLabel(item.rating)
  }));

  let nextCursor = null;
  if (items.length > 0 && hasMore) {
    const lastItem = items[items.length - 1];
    const lastVal = lastItem[jsFieldName];
    nextCursor = Buffer.from(JSON.stringify({ val: lastVal, id: lastItem.id })).toString('base64');
  }

  res.json({
    items,
    nextCursor,
    hasMore
  });
}));

app.get('/api/problems/:slug', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await query(
    `SELECT id,slug,title,difficulty,rating,description,starter_code,examples,time_limit_minutes,execution_limit_ms,is_active
     FROM problems WHERE slug=$1 AND (is_active=TRUE OR $2='ADMIN')`,
    [req.params.slug, req.user.role]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy bài tập.' });
  res.json({ problem: rows[0] });
}));

app.post('/api/attempts', requireAuth, asyncRoute(async (req, res) => {
  const { rows: problems } = await query('SELECT id,time_limit_minutes FROM problems WHERE slug=$1 AND is_active=TRUE', [req.body.slug]);
  if (!problems[0]) return res.status(404).json({ error: 'Không tìm thấy bài tập.' });
  await query(
    `UPDATE attempts SET status='EXPIRED' WHERE user_id=$1 AND problem_id=$2 AND status='IN_PROGRESS' AND deadline_at <= NOW()`,
    [req.user.id, problems[0].id]
  );
  const existing = await query(
    `SELECT id,started_at,deadline_at FROM attempts
     WHERE user_id=$1 AND problem_id=$2 AND status='IN_PROGRESS' AND deadline_at>NOW()
     ORDER BY started_at DESC LIMIT 1`,
    [req.user.id, problems[0].id]
  );
  if (existing.rows[0]) return res.json({ attempt: existing.rows[0] });
  const { rows } = await query(
    `INSERT INTO attempts(user_id,problem_id,deadline_at)
     VALUES ($1,$2,NOW()+($3 * INTERVAL '1 minute')) RETURNING id,started_at,deadline_at`,
    [req.user.id, problems[0].id, problems[0].time_limit_minutes]
  );
  res.status(201).json({ attempt: rows[0] });
}));

app.post('/api/run', requireAuth, asyncRoute(async (req, res) => {
  const code = String(req.body.code || '').slice(0, 30000);
  const input = String(req.body.input || '').slice(0, 10000);
  if (!code.trim()) return res.status(400).json({ error: 'Chưa có code để chạy.' });
  const result = config.judgeServiceUrl
    ? await judgeSubmission(code, [{ input, output: '' }], 2000)
    : await runPythonLocal(code, input, 2000);
  if (config.judgeServiceUrl) {
    const report = result.reports[0];
    const isSystemOrRuntimeError = report.status !== 'Accepted' && report.status !== 'Wrong Answer';
    return res.json({ output: report.actual || '', error: isSystemOrRuntimeError ? report.error : null });
  }
  const errorModel = parseRunnerError(result, 2000);
  let error = null;
  if (errorModel) {
    error = errorModel.safeForUser
      ? `${errorModel.status}: ${errorModel.message}${errorModel.line ? ` (dòng ${errorModel.line})` : ''}`
      : 'Runner error: không thể khởi động môi trường chạy Python';
  }
  res.json({ output: result.output, error });
}));

app.post('/api/submissions', requireAuth, asyncRoute(async (req, res) => {
  const code = String(req.body.code || '').slice(0, 30000);
  if (!code.trim()) return res.status(400).json({ error: 'Chưa có code để nộp.' });
  const attemptResult = await query(
    `SELECT a.*,p.execution_limit_ms,p.id AS problem_id,p.passing_score,p.compare_mode,p.number_tolerance
     FROM attempts a JOIN problems p ON p.id=a.problem_id
     WHERE a.id=$1 AND a.user_id=$2`,
    [req.body.attemptId, req.user.id]
  );
  const attempt = attemptResult.rows[0];
  if (!attempt) return res.status(404).json({ error: 'Lượt làm không tồn tại.' });
  if (attempt.status !== 'IN_PROGRESS') return res.status(409).json({ error: 'Lượt làm này đã kết thúc.' });

  // Query test cases from problem_testcases
  const { rows: testcases } = await query(
    `SELECT input, expected_output AS output, is_public, weight FROM problem_testcases WHERE problem_id=$1 ORDER BY order_index ASC`,
    [attempt.problem_id]
  );

  const now = Date.now();
  const started = new Date(attempt.started_at).getTime();
  const expired = now > new Date(attempt.deadline_at).getTime();
  let judged = { passed: 0, total: testcases.length, score: 0, reports: [] };
  let status = 'EXPIRED';
  if (!expired) {
    judged = await judgeSubmission(code, testcases, attempt.execution_limit_ms, false, {
      compareMode: attempt.compare_mode,
      numberTolerance: attempt.number_tolerance
    });
    const hadTimeout = judged.reports.some((r) => r.status === 'Time Limit Exceeded');
    const hadOutputLimit = judged.reports.some((r) => r.status === 'Output Limit Exceeded');
    const hadMemoryLimit = judged.reports.some((r) => r.status === 'Memory Limit Exceeded');
    const hadRuntime = judged.reports.some((r) => r.status === 'Runtime Error');
    
    if (judged.score === 100) {
      status = 'ACCEPTED';
    } else if (hadTimeout) {
      status = 'TIME_LIMIT';
    } else if (hadOutputLimit) {
      status = 'OUTPUT_LIMIT';
    } else if (hadMemoryLimit) {
      status = 'MEMORY_LIMIT';
    } else if (hadRuntime) {
      status = 'RUNTIME_ERROR';
    } else {
      status = 'WRONG_ANSWER';
    }
  }
  const saved = await transaction(async (client) => {
    await client.query(
      `UPDATE attempts SET status=$1,submitted_at=NOW() WHERE id=$2`,
      [expired ? 'EXPIRED' : 'SUBMITTED', attempt.id]
    );
    const result = await client.query(
      `INSERT INTO submissions(user_id,problem_id,attempt_id,code,status,score,passed_count,total_count,duration_ms,report)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       RETURNING id,status,score,passed_count,total_count,duration_ms,created_at`,
      [req.user.id, attempt.problem_id, attempt.id, code, status, judged.score, judged.passed,
        judged.total, Math.max(0, now - started), JSON.stringify(judged.reports)]
    );
    const submission = result.rows[0];
    const shouldComplete = isCompletedSubmission(submission.score, submission.status, attempt.passing_score);
    await client.query(
      `INSERT INTO user_problem_progress (
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
      ) VALUES ($1, $2, $3, $4::integer, $5, 1, NOW(), NOW(), CASE WHEN $5 = 'ACCEPTED' OR $4::integer >= $6::integer THEN NOW() ELSE NULL END, NOW())
      ON CONFLICT (user_id, problem_id) DO UPDATE SET
        submission_count = user_problem_progress.submission_count + 1,
        last_submitted_at = NOW(),
        best_submission_id = CASE WHEN $4::integer > user_problem_progress.best_score OR user_problem_progress.best_submission_id IS NULL THEN $3 ELSE user_problem_progress.best_submission_id END,
        best_status = CASE WHEN $4::integer > user_problem_progress.best_score OR user_problem_progress.best_submission_id IS NULL THEN $5 ELSE user_problem_progress.best_status END,
        best_score = CASE WHEN $4::integer > user_problem_progress.best_score OR user_problem_progress.best_submission_id IS NULL THEN $4::integer ELSE user_problem_progress.best_score END,
        completed_at = COALESCE(user_problem_progress.completed_at, CASE WHEN $5 = 'ACCEPTED' OR $4::integer >= $6::integer THEN NOW() ELSE NULL END),
        updated_at = NOW()`,
      [
        req.user.id,
        attempt.problem_id,
        submission.id,
        submission.score,
        submission.status,
        attempt.passing_score
      ]
    );
    if (shouldComplete) {
      await client.query(
        `UPDATE student_problem_assignments
         SET status='COMPLETED',
             completed_at = COALESCE(completed_at, NOW()),
             updated_at = NOW()
         WHERE user_id=$1 AND problem_id=$2 AND status='ASSIGNED'`,
        [req.user.id, attempt.problem_id]
      );
    }
    return result;
  });

  const submission = saved.rows[0];

  res.status(201).json({ submission, reports: judged.reports });
}));

app.get('/api/me/submissions', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await query(
    `SELECT s.id,s.status,s.score,s.passed_count,s.total_count,s.duration_ms,s.created_at,p.title,p.slug
     FROM submissions s JOIN problems p ON p.id=s.problem_id WHERE s.user_id=$1 ORDER BY s.created_at DESC LIMIT 100`,
    [req.user.id]
  );
  res.json({ submissions: rows });
}));

app.get('/api/leaderboard', requireAuth, asyncRoute(async (_req, res) => {
  const { rows } = await query(
    `SELECT u.full_name,COUNT(DISTINCT CASE WHEN best.score=100 THEN best.problem_id END)::int AS solved,
       COALESCE(SUM(best.score),0)::int AS total_score
     FROM users u LEFT JOIN (
       SELECT user_id,problem_id,MAX(score)::int AS score FROM submissions GROUP BY user_id,problem_id
     ) best ON best.user_id=u.id WHERE u.is_active=TRUE
     GROUP BY u.id,u.full_name ORDER BY solved DESC,total_score DESC,u.full_name LIMIT 100`
  );
  res.json({ leaderboard: rows });
}));

app.get('/api/admin/dashboard', requireAdmin, asyncRoute(async (_req, res) => {
  const [users, problems, submissions, recent] = await Promise.all([
    query("SELECT COUNT(*)::int AS value FROM users WHERE role='STUDENT'"),
    query('SELECT COUNT(*)::int AS value FROM problems'),
    query('SELECT COUNT(*)::int AS value FROM submissions'),
    query(`SELECT s.id,s.status,s.score,s.duration_ms,s.created_at,u.full_name,u.email,p.title
           FROM submissions s JOIN users u ON u.id=s.user_id JOIN problems p ON p.id=s.problem_id
           ORDER BY s.created_at DESC LIMIT 30`)
  ]);
  res.json({ stats: { students: users.rows[0].value, problems: problems.rows[0].value, submissions: submissions.rows[0].value }, recent: recent.rows });
}));

app.get('/api/admin/problems/:id', requireAdmin, asyncRoute(async (req, res) => {
  const { rows } = await query('SELECT * FROM problems WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy bài.' });
  const problem = rows[0];
  const { rows: testcases } = await query(
    'SELECT input, expected_output AS output, explanation, is_public, weight, order_index FROM problem_testcases WHERE problem_id=$1 ORDER BY order_index ASC',
    [problem.id]
  );
  problem.testcases = testcases;
  res.json({ problem });
}));

app.post('/api/admin/problems', requireAdmin, asyncRoute(async (req, res) => {
  const p = normalizeProblem(req.body);
  const errors = validateProblem(p);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  const saved = await transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO problems(slug,title,difficulty,rating,max_score,passing_score,published_at,source,order_index,description,starter_code,examples,time_limit_minutes,execution_limit_ms,is_active,created_by,compare_mode,number_tolerance)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [p.slug, p.title, p.difficulty, p.rating, p.maxScore, p.passingScore, p.publishedAt, p.source, p.orderIndex,
        p.description, p.starterCode, JSON.stringify(p.examples), p.timeLimitMinutes, p.executionLimitMs, p.isActive, req.user.id, p.compareMode, p.numberTolerance]
    );
    const problem = rows[0];
    for (const tc of p.testcases) {
      await client.query(
        `INSERT INTO problem_testcases(problem_id, input, expected_output, explanation, is_public, weight, order_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [problem.id, tc.input, tc.output, tc.explanation, tc.isPublic, tc.weight, tc.orderIndex]
      );
    }
    problem.testcases = p.testcases;
    return problem;
  });
  res.status(201).json({ problem: saved });
}));

app.put('/api/admin/problems/:id', requireAdmin, asyncRoute(async (req, res) => {
  const p = normalizeProblem(req.body);
  const errors = validateProblem(p);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  const saved = await transaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE problems SET slug=$1,title=$2,difficulty=$3,rating=$4,max_score=$5,passing_score=$6,
         published_at=$7,source=$8,order_index=$9,description=$10,starter_code=$11,examples=$12::jsonb,
         time_limit_minutes=$13,execution_limit_ms=$14,is_active=$15,compare_mode=$16,number_tolerance=$17,updated_at=NOW()
       WHERE id=$18 RETURNING *`,
      [p.slug, p.title, p.difficulty, p.rating, p.maxScore, p.passingScore, p.publishedAt, p.source, p.orderIndex,
        p.description, p.starterCode, JSON.stringify(p.examples), p.timeLimitMinutes, p.executionLimitMs, p.isActive,
        p.compareMode, p.numberTolerance, req.params.id]
    );
    const problem = rows[0];
    if (!problem) return null;
    await client.query('DELETE FROM problem_testcases WHERE problem_id=$1', [problem.id]);
    for (const tc of p.testcases) {
      await client.query(
        `INSERT INTO problem_testcases(problem_id, input, expected_output, explanation, is_public, weight, order_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [problem.id, tc.input, tc.output, tc.explanation, tc.isPublic, tc.weight, tc.orderIndex]
      );
    }
    problem.testcases = p.testcases;
    return problem;
  });
  if (!saved) return res.status(404).json({ error: 'Không tìm thấy bài.' });
  res.json({ problem: saved });
}));

app.delete('/api/admin/problems/:id', requireAdmin, asyncRoute(async (req, res) => {
  const result = await query('UPDATE problems SET is_active=FALSE,updated_at=NOW() WHERE id=$1', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Không tìm thấy bài.' });
  res.json({ ok: true });
}));

app.post('/api/admin/problems/import', requireAdmin, asyncRoute(async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : req.body.problems;
  if (!Array.isArray(items) || !items.length || items.length > 100) return res.status(400).json({ error: 'File cần chứa từ 1 đến 100 bài.' });
  
  const validationErrors = [];
  const normalized = [];
  for (let i = 0; i < items.length; i++) {
    const pRaw = items[i];
    const p = normalizeProblem({ ...pRaw, slug: pRaw.slug || pRaw.id });
    normalized.push(p);
    const errs = validateProblem(p);
    if (errs.length) {
      const name = p.title || p.slug || `Bài ${i + 1}`;
      validationErrors.push(`Bài "${name}": ${errs.join(' ')}`);
    }
  }

  if (validationErrors.length) {
    return res.status(400).json({ error: validationErrors.join(' | ') });
  }

  let createdCount = 0;
  let updatedCount = 0;
  const slugsAffected = [];

  await transaction(async (client) => {
    for (const p of normalized) {
      const existing = await client.query('SELECT id FROM problems WHERE slug = $1', [p.slug]);
      const isUpdate = existing.rows.length > 0;
      if (isUpdate) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }

      const { rows } = await client.query(
        `INSERT INTO problems(slug,title,difficulty,rating,max_score,passing_score,published_at,source,order_index,description,starter_code,examples,time_limit_minutes,execution_limit_ms,is_active,created_by,compare_mode,number_tolerance)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18)
         ON CONFLICT(slug) DO UPDATE SET
           title=EXCLUDED.title,
           difficulty=EXCLUDED.difficulty,
           rating=EXCLUDED.rating,
           max_score=EXCLUDED.max_score,
           passing_score=EXCLUDED.passing_score,
           published_at=EXCLUDED.published_at,
           source=EXCLUDED.source,
           order_index=EXCLUDED.order_index,
           description=EXCLUDED.description,
           starter_code=EXCLUDED.starter_code,
           examples=EXCLUDED.examples,
           time_limit_minutes=EXCLUDED.time_limit_minutes,
           execution_limit_ms=EXCLUDED.execution_limit_ms,
           is_active=EXCLUDED.is_active,
           compare_mode=EXCLUDED.compare_mode,
           number_tolerance=EXCLUDED.number_tolerance,
           updated_at=NOW()
         RETURNING id`,
        [p.slug, p.title, p.difficulty, p.rating, p.maxScore, p.passingScore, p.publishedAt, p.source, p.orderIndex,
          p.description, p.starterCode, JSON.stringify(p.examples), p.timeLimitMinutes, p.executionLimitMs, p.isActive, req.user.id, p.compareMode, p.numberTolerance]
      );
      const problemId = rows[0].id;
      slugsAffected.push(p.slug);

      await client.query('DELETE FROM problem_testcases WHERE problem_id=$1', [problemId]);
      for (const tc of p.testcases) {
        await client.query(
          `INSERT INTO problem_testcases(problem_id, input, expected_output, explanation, is_public, weight, order_index)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [problemId, tc.input, tc.output, tc.explanation, tc.isPublic, tc.weight, tc.orderIndex]
        );
      }
    }
  });

  res.json({
    imported: normalized.length,
    created: createdCount,
    updated: updatedCount,
    errors: [],
    slugs: slugsAffected
  });
}));

app.get('/api/admin/users', requireAdmin, asyncRoute(async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id,u.email,u.full_name,u.role,u.is_active,u.created_at,COUNT(s.id)::int AS submissions,
       COALESCE(MAX(s.score),0)::int AS best_score FROM users u LEFT JOIN submissions s ON s.user_id=u.id
     GROUP BY u.id ORDER BY u.created_at DESC LIMIT 300`
  );
  res.json({ users: rows });
}));

app.get('/api/admin/student-assignments', requireAdmin, asyncRoute(async (req, res) => {
  const userId = String(req.query.userId || '').trim();
  const status = normalizeAssignmentStatusFilter(req.query.status);
  if (!userId) return res.status(400).json({ error: 'Thiếu học sinh.' });

  const { rows: studentRows } = await query(
    `SELECT id, email, full_name, role, is_active
     FROM users
     WHERE id=$1`,
    [userId]
  );
  const student = studentRows[0];
  if (!student || student.role !== 'STUDENT') {
    return res.status(404).json({ error: 'Không tìm thấy học sinh.' });
  }

  const params = [userId];
  const statusClause = status === 'all' ? '' : `AND spa.status = $2`;
  if (status !== 'all') params.push(status);

  const { rows } = await query(
    `SELECT
       spa.id,
       spa.user_id,
       spa.problem_id,
       spa.assigned_by,
       spa.status,
       spa.note,
       spa.assigned_at,
       spa.completed_at,
       spa.cancelled_at,
       spa.copied_from_user_id,
       spa.copied_from_assignment_id,
       spa.created_at,
       spa.updated_at,
       p.slug,
       p.title,
       p.rating,
       p.is_active,
       assigner.full_name AS assigned_by_name,
       copied_from.full_name AS copied_from_user_name
     FROM student_problem_assignments spa
     JOIN problems p ON p.id = spa.problem_id
     LEFT JOIN users assigner ON assigner.id = spa.assigned_by
     LEFT JOIN users copied_from ON copied_from.id = spa.copied_from_user_id
     WHERE spa.user_id = $1 ${statusClause}
     ORDER BY spa.assigned_at DESC, spa.created_at DESC`,
    params
  );

  res.json({ student, assignments: rows });
}));

app.post('/api/admin/student-assignments', requireAdmin, asyncRoute(async (req, res) => {
  const userId = String(req.body.userId || '').trim();
  const problemIds = parseUuidList(req.body.problemIds, 100);
  const note = cleanText(req.body.note, 1000);
  const force = Boolean(req.body.force);

  if (!userId || !problemIds.length) {
    return res.status(400).json({ error: 'Thiếu học sinh hoặc danh sách bài tập.' });
  }

  const { rows: studentRows } = await query(
    `SELECT id, email, full_name, role, is_active
     FROM users
     WHERE id=$1`,
    [userId]
  );
  const student = studentRows[0];
  if (!student || student.role !== 'STUDENT' || !student.is_active) {
    return res.status(404).json({ error: 'Không tìm thấy học sinh.' });
  }

  const { rows: problemStates } = await query(
    `SELECT
       req.problem_id,
       p.is_active AS problem_is_active,
       spa.id AS active_assignment_id,
       (upp.completed_at IS NOT NULL OR COALESCE(upp.best_score, 0) >= 100) AS is_completed
     FROM unnest($2::uuid[]) AS req(problem_id)
     LEFT JOIN problems p ON p.id = req.problem_id
     LEFT JOIN student_problem_assignments spa
       ON spa.user_id = $1
      AND spa.problem_id = req.problem_id
      AND spa.status = 'ASSIGNED'
     LEFT JOIN user_problem_progress upp
       ON upp.user_id = $1
      AND upp.problem_id = req.problem_id`,
    [userId, problemIds]
  );

  const eligibleProblemIds = [];
  let skippedInactive = 0;
  let skippedAlreadyAssigned = 0;
  let skippedCompleted = 0;
  let createdCount = 0;

  for (const row of problemStates) {
    if (!row.problem_is_active) {
      skippedInactive += 1;
      continue;
    }
    if (row.is_completed && !force) {
      skippedCompleted += 1;
      continue;
    }
    if (row.active_assignment_id) {
      skippedAlreadyAssigned += 1;
      continue;
    }
    eligibleProblemIds.push(row.problem_id);
  }

  if (eligibleProblemIds.length) {
    await transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO student_problem_assignments (
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
         SELECT $1::uuid, req.problem_id, $2::uuid, 'ASSIGNED', $3::text, NOW(), NULL, NULL, NULL, NULL, NOW(), NOW()
         FROM unnest($4::uuid[]) AS req(problem_id)
         ON CONFLICT DO NOTHING
         RETURNING problem_id`,
        [userId, req.user.id, note, eligibleProblemIds]
      );
      createdCount = inserted.rowCount;
    });
  }

  res.status(201).json({
    createdCount,
    skippedAlreadyAssigned,
    skippedCompleted,
    skippedInactive
  });
}));

app.patch('/api/admin/student-assignments/:id/cancel', requireAdmin, asyncRoute(async (req, res) => {
  const { rows } = await query(
    `UPDATE student_problem_assignments
     SET status='CANCELLED',
         cancelled_at = COALESCE(cancelled_at, NOW()),
         updated_at = NOW()
     WHERE id=$1 AND status='ASSIGNED'
     RETURNING *`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy bài đang được giao.' });
  res.json({ assignment: rows[0] });
}));

app.post('/api/admin/student-assignments/copy', requireAdmin, asyncRoute(async (req, res) => {
  const fromUserId = String(req.body.fromUserId || '').trim();
  const toUserId = String(req.body.toUserId || '').trim();

  if (!fromUserId || !toUserId) {
    return res.status(400).json({ error: 'Thiếu học sinh nguồn hoặc học sinh đích.' });
  }
  if (fromUserId === toUserId) {
    return res.status(400).json({ error: 'Học sinh nguồn và đích phải khác nhau.' });
  }

  const { rows: users } = await query(
    `SELECT id, email, full_name, role, is_active
     FROM users
     WHERE id = ANY($1::uuid[])`,
    [[fromUserId, toUserId]]
  );
  const sourceUser = users.find((row) => row.id === fromUserId);
  const targetUser = users.find((row) => row.id === toUserId);
  if (!sourceUser || !targetUser || sourceUser.role !== 'STUDENT' || targetUser.role !== 'STUDENT' || !sourceUser.is_active || !targetUser.is_active) {
    return res.status(404).json({ error: 'Không tìm thấy học sinh nguồn hoặc học sinh đích.' });
  }

  const { rows: sourceAssignments } = await query(
    `SELECT
       spa.id AS assignment_id,
       spa.problem_id,
       spa.note,
       p.is_active AS problem_is_active
     FROM student_problem_assignments spa
     JOIN problems p ON p.id = spa.problem_id
     WHERE spa.user_id = $1 AND spa.status = 'ASSIGNED'
     ORDER BY spa.assigned_at DESC, spa.created_at DESC`,
    [fromUserId]
  );

  if (!sourceAssignments.length) {
    return res.json({ copiedCount: 0, skippedAlreadyAssigned: 0, skippedCompleted: 0, skippedInactive: 0 });
  }

  const problemIds = sourceAssignments.map((row) => row.problem_id);
  const { rows: targetStates } = await query(
    `SELECT
       req.problem_id,
       p.is_active AS problem_is_active,
       spa.id AS active_assignment_id,
       (upp.completed_at IS NOT NULL OR COALESCE(upp.best_score, 0) >= 100) AS is_completed
     FROM unnest($1::uuid[]) AS req(problem_id)
     LEFT JOIN problems p ON p.id = req.problem_id
     LEFT JOIN student_problem_assignments spa
       ON spa.user_id = $2
      AND spa.problem_id = req.problem_id
      AND spa.status = 'ASSIGNED'
     LEFT JOIN user_problem_progress upp
       ON upp.user_id = $2
      AND upp.problem_id = req.problem_id`,
    [problemIds, toUserId]
  );

  const targetStateMap = new Map(targetStates.map((row) => [row.problem_id, row]));
  const assignmentsToCopy = [];
  let skippedInactive = 0;
  let skippedAlreadyAssigned = 0;
  let skippedCompleted = 0;
  let copiedCount = 0;

  for (const sourceAssignment of sourceAssignments) {
    const targetState = targetStateMap.get(sourceAssignment.problem_id);
    if (!targetState || !targetState.problem_is_active || !sourceAssignment.problem_is_active) {
      skippedInactive += 1;
      continue;
    }
    if (targetState.is_completed) {
      skippedCompleted += 1;
      continue;
    }
    if (targetState.active_assignment_id) {
      skippedAlreadyAssigned += 1;
      continue;
    }
    assignmentsToCopy.push(sourceAssignment);
  }

  if (assignmentsToCopy.length) {
    await transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO student_problem_assignments (
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
         SELECT $1::uuid, req.problem_id, $2::uuid, 'ASSIGNED', req.note, NOW(), NULL, NULL, $3::uuid, req.assignment_id, NOW(), NOW()
         FROM unnest($4::uuid[], $5::text[], $6::uuid[]) AS req(problem_id, note, assignment_id)
         ON CONFLICT DO NOTHING
         RETURNING problem_id`,
        [
          toUserId,
          req.user.id,
          fromUserId,
          assignmentsToCopy.map((row) => row.problem_id),
          assignmentsToCopy.map((row) => row.note || ''),
          assignmentsToCopy.map((row) => row.assignment_id)
        ]
      );
      copiedCount = inserted.rowCount;
    });
  }

  res.json({
    copiedCount,
    skippedAlreadyAssigned,
    skippedCompleted,
    skippedInactive
  });
}));

app.patch('/api/admin/users/:id', requireAdmin, asyncRoute(async (req, res) => {
  const role = req.body.role === 'ADMIN' ? 'ADMIN' : 'STUDENT';
  const active = Boolean(req.body.isActive);
  if (req.params.id === req.user.id && (!active || role !== 'ADMIN')) return res.status(400).json({ error: 'Không thể tự khóa hoặc hạ quyền tài khoản đang dùng.' });
  const { rows } = await query('UPDATE users SET role=$1,is_active=$2,updated_at=NOW() WHERE id=$3 RETURNING id,email,full_name,role,is_active', [role, active, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
  res.json({ user: rows[0] });
}));

app.post('/internal/judge', asyncRoute(async (req, res) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!config.judgeServiceToken || token !== config.judgeServiceToken) return res.status(401).json({ error: 'Unauthorized' });
  const code = String(req.body.code || '').slice(0, 30000);
  const testcases = Array.isArray(req.body.testcases) ? req.body.testcases.slice(0, 30) : [];
  const options = req.body.options || {};
  res.json(await judgeSubmission(code, testcases, Number(req.body.limitMs) || 1500, true, options));
}));

app.use('/vendor/monaco/vs', express.static(path.join(root, 'node_modules', 'monaco-editor', 'min', 'vs'), {
  maxAge: config.isProduction ? '7d' : 0,
  immutable: config.isProduction
}));
app.use('/vendor/xterm', express.static(path.join(root, 'node_modules', '@xterm', 'xterm'), {
  maxAge: config.isProduction ? '7d' : 0,
  immutable: config.isProduction
}));
app.use('/vendor/xterm-fit', express.static(path.join(root, 'node_modules', '@xterm', 'addon-fit'), {
  maxAge: config.isProduction ? '7d' : 0,
  immutable: config.isProduction
}));
app.use(express.static(path.join(root, 'public'), { extensions: ['html'], maxAge: config.isProduction ? '1h' : 0 }));
app.get('*splat', (_req, res) => res.sendFile(path.join(root, 'public', 'index.html')));

app.use((error, _req, res, _next) => {
  console.error(error);
  const known = error.code === '23505' ? 'Dữ liệu bị trùng.' : null;
  res.status(known ? 409 : 500).json({ error: known || 'Máy chủ gặp lỗi. Vui lòng thử lại.' });
});

const server = http.createServer(app);
attachTerminalServer(server);

const isTest = process.env.NODE_ENV === 'test' || process.execArgv.includes('--test') || (process.argv && process.argv.some(arg => arg.includes('test')));
if (!process.env.VERCEL && !isTest) {
  server.listen(config.port, '0.0.0.0', () => console.log(`SimpleOJ listening on http://0.0.0.0:${config.port}`));
}

export default app;
export { server };
```

### File: `src/terminal-runner.py`

```text
import math
import os
import runpy
import sys


def apply_limits():
    try:
        import resource

        timeout_ms = int(os.environ.get("SIMPLEOJ_TERMINAL_TIMEOUT_MS", "60000"))
        cpu_seconds = max(2, math.ceil(timeout_ms / 1000) + 1)
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
        resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_FSIZE, (2 * 1024 * 1024, 2 * 1024 * 1024))
        if hasattr(resource, "RLIMIT_NPROC"):
            resource.setrlimit(resource.RLIMIT_NPROC, (16, 16))
    except (ImportError, OSError, ValueError):
        # Windows does not expose POSIX rlimits. The Node parent still enforces
        # wall-clock timeout, output limits, a temporary cwd, and process cleanup.
        pass


def main():
    apply_limits()
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    if len(sys.argv) != 2:
        raise SystemExit("Invalid terminal runner invocation")

    import builtins
    import traceback
    
    _original_import = builtins.__import__
    BLOCKED_MODULES = {"os", "subprocess", "socket", "multiprocessing", "threading"}
    
    global is_running_user_code
    is_running_user_code = False

    def restricted_import(name, globals=None, locals=None, fromlist=(), level=0):
        # Check call stack to see if import is initiated by user code
        is_user_import = False
        caller_frame = sys._getframe(1)
        while caller_frame:
            filename = caller_frame.f_code.co_filename
            if filename and (filename.endswith("main.py") or filename.endswith("submission.py") or filename == "<stdin>" or filename == "<string>"):
                is_user_import = True
                break
            caller_frame = caller_frame.f_back

        if is_user_import:
            top_level_name = name.split('.')[0]
            if top_level_name in BLOCKED_MODULES:
                raise ImportError(f"[Blocked import: {top_level_name}]\nModule này không được phép trong môi trường SimpleOJ.")
        return _original_import(name, globals, locals, fromlist, level)

    builtins.__import__ = restricted_import

    if sys.argv[1] == "--repl":
        import code

        is_running_user_code = True
        try:
            code.interact(
                banner=f"Python {sys.version.split()[0]} on SimpleOJ",
                local={"__name__": "__main__", "__builtins__": __builtins__},
            )
        finally:
            is_running_user_code = False
        return

    if sys.argv[1] == "main.py":
        _original_input = builtins.input

        def wrapped_input(*args, **kwargs):
            prompt = None
            if args:
                prompt = args[0]
            elif "prompt" in kwargs:
                prompt = kwargs["prompt"]

            if prompt is not None:
                sys.stdout.write(str(prompt))
                sys.stdout.flush()
            sys.stderr.write("__SIMPLEOJ_WAITING_INPUT__\n")
            sys.stderr.flush()
            try:
                res = _original_input()
            finally:
                sys.stderr.write("__SIMPLEOJ_RUNNING__\n")
                sys.stderr.flush()
            return res

        builtins.input = wrapped_input
        sys.argv = ["main.py"]
        
        is_running_user_code = True
        try:
            runpy.run_path("main.py", run_name="__main__")
        except BaseException:
            exc_type, exc_value, exc_tb = sys.exc_info()
            tb = exc_tb
            while tb is not None:
                filename = tb.tb_frame.f_code.co_filename
                if filename and filename.endswith("main.py"):
                    break
                tb = tb.tb_next
                
            if tb is not None:
                sys.stderr.write("Traceback (most recent call last):\n")
                tb_lines = traceback.format_exception(exc_type, exc_value, tb)
                if tb_lines and "Traceback" in tb_lines[0]:
                    tb_lines = tb_lines[1:]
                tb_lines = [line for line in tb_lines if "terminal-runner.py" not in line and "runpy.py" not in line]
                sys.stderr.write("".join(tb_lines))
            else:
                tb_lines = traceback.format_exception(exc_type, exc_value, exc_tb)
                tb_lines = [line for line in tb_lines if "terminal-runner.py" not in line and "runpy.py" not in line]
                sys.stderr.write("".join(tb_lines))
            sys.exit(1)
        finally:
            is_running_user_code = False
        return
    raise SystemExit("Only main.py and the Python REPL are allowed")


if __name__ == "__main__":
    main()
```

### File: `src/terminal.js`

```javascript
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from './config.js';
import { query } from './db.js';

const terminalRunnerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'terminal-runner.py');
const COOKIE_NAME = 'simpleoj_session';
const MAX_CODE_SIZE = 64 * 1024; // 64KB
const MAX_OUTPUT_SIZE = config.terminalOutputLimitBytes;
const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

let ptyModulePromise;
const activeSessions = new Map();
const runningProcesses = new Set();

function loadPty() {
  if (!ptyModulePromise) {
    ptyModulePromise = import('node-pty').then((module) => module.default || module).catch(() => null);
  }
  return ptyModulePromise;
}

function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

async function authenticate(request) {
  try {
    const token = parseCookies(request.headers.cookie)[COOKIE_NAME];
    if (!token) return null;
    const payload = jwt.verify(token, config.jwtSecret);
    const { rows } = await query('SELECT id,role,is_active FROM users WHERE id=$1', [payload.sub]);
    return rows[0]?.is_active ? rows[0] : null;
  } catch {
    return null;
  }
}

function rejectUpgrade(socket, status, message) {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`);
  socket.destroy();
}

function sendJson(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function normalizeCommand(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

class TerminalSession {
  constructor(ws, user) {
    this.ws = ws;
    this.user = user;
    this.process = null;
    this.processKind = null;
    this.workdir = null;
    this.outputBytes = 0;
    this.closed = false;
    
    this.idleTimer = null;
    
    // Process state & timers
    this.processState = 'RUNNING'; // 'RUNNING' or 'WAITING_INPUT'
    this.runningTimeLeft = 10000; // 10 seconds of active CPU time left
    this.lastRunningStartTime = 0;
    this.processKilledReason = null;
    
    this.processActiveTimer = null;
    this.processInputTimer = null;
    this.processLifetimeTimer = null;
    
    this.replIdleTimer = null;
    this.replLifetimeTimer = null;
  }

  async start() {
    this.touch();
    sendJson(this.ws, { type: 'ready' });
  }

  touch() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.output('\r\nPhiên terminal đã hết hạn do không hoạt động.\r\n');
      this.close(1000, 'Session expired');
    }, SESSION_IDLE_TIMEOUT_MS);
  }

  output(data) {
    if (!data || this.closed) return;
    const text = String(data);
    this.outputBytes += Buffer.byteLength(text);
    if (this.outputBytes > MAX_OUTPUT_SIZE) {
      sendJson(this.ws, { type: 'output', data: '\r\n[Output limit exceeded: chương trình in quá nhiều dữ liệu]\r\n' });
      this.processKilledReason = 'OUTPUT_LIMIT';
      this.stopProcess('SIGKILL');
      return;
    }
    sendJson(this.ws, { type: 'output', data: text });
  }

  async handle(message) {
    this.touch();
    if (!message || typeof message !== 'object') return;

    if (message.type === 'runFile') {
      const code = String(message.code || '').slice(0, 64 * 1024);
      if (String(message.code || '').length > 64 * 1024) {
        sendJson(this.ws, { type: 'error', message: 'Mã nguồn vượt quá giới hạn 64KB.' });
        return;
      }
      await this.killActiveProcess();
      
      if (!this.workdir) {
        this.workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'simpleoj-terminal-'));
        await fs.chmod(this.workdir, 0o755).catch(() => {});
      }
      
      await fs.writeFile(path.join(this.workdir, 'main.py'), code, { encoding: 'utf8', mode: 0o644 });
      await this.runPython('main.py');
    }

    else if (message.type === 'startRepl') {
      await this.killActiveProcess();
      
      if (!this.workdir) {
        this.workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'simpleoj-terminal-'));
        await fs.chmod(this.workdir, 0o755).catch(() => {});
      }
      
      await this.runPython('--repl');
    }

    else if (message.type === 'stdin') {
      if (this.process) {
        const data = String(message.data || '').slice(0, 4096);
        if (this.replIdleTimer) {
          this.resetReplIdleTimer();
        }
        if (this.processKind === 'pty') {
          this.process.write(data);
        } else {
          this.process.stdin?.write(data);
        }
      }
    }

    else if (message.type === 'interrupt') {
      await this.interrupt();
    }

    else if (message.type === 'dispose') {
      await this.close(1000, 'Client disposed');
    }
  }

  async runPython(mode) {
    if (runningProcesses.size >= config.maxGlobalPythonProcesses) {
      sendJson(this.ws, { type: 'error', message: 'Server busy, please try again' });
      sendJson(this.ws, { type: 'exit', code: 1 });
      return;
    }

    this.outputBytes = 0;
    const pty = await loadPty();
    const dropPrivileges = process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() === 0;
    const env = {
      PATH: process.env.PATH || '',
      LANG: process.env.LANG || 'C.UTF-8',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1',
    };

    if (pty && mode === '--repl') {
      try {
        this.processKind = 'pty';
        this.process = pty.spawn(config.pythonCommand, ['-u', '-I', terminalRunnerPath, mode], {
          name: 'xterm-256color', cwd: this.workdir, env, cols: 80, rows: 24,
          ...(dropPrivileges ? { uid: 65534, gid: 65534 } : {})
        });
        runningProcesses.add(this.process);
        
        const proc = this.process;
        this.process.onData((data) => this.output(data));
        this.process.onExit(() => {
          runningProcesses.delete(proc);
          this.finishProcess();
        });
      } catch {
        this.process = null;
        this.processKind = null;
      }
    }

    if (!this.process) {
      try {
        this.processKind = 'spawn';
        const args = mode === '--repl'
          ? ['-u', '-i', '-I', terminalRunnerPath, mode]
          : ['-u', '-I', terminalRunnerPath, mode];
          
        this.process = spawn(config.pythonCommand, args, {
          cwd: this.workdir, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
          ...(dropPrivileges ? { uid: 65534, gid: 65534 } : {})
        });
        runningProcesses.add(this.process);
        
        const proc = this.process;
        this.process.stdout.on('data', (chunk) => this.output(chunk.toString('utf8')));
        
        // Custom parser for stderr to catch state markers
        let stderrBuffer = '';
        this.process.stderr.on('data', (chunk) => {
          stderrBuffer += chunk.toString('utf8');
          
          if (stderrBuffer.includes('MemoryError')) {
            this.output('\r\n[Memory limit exceeded: chương trình dùng quá nhiều bộ nhớ]\r\n');
            this.processKilledReason = 'MEMORY_LIMIT';
            this.killActiveProcess();
            return;
          }
          
          while (true) {
            let markerIndex = -1;
            let markerLen = 0;
            let nextState = null;
            
            const idxWaiting = stderrBuffer.indexOf('__SIMPLEOJ_WAITING_INPUT__');
            const idxRunning = stderrBuffer.indexOf('__SIMPLEOJ_RUNNING__');
            
            if (idxWaiting !== -1 && (idxRunning === -1 || idxWaiting < idxRunning)) {
              markerIndex = idxWaiting;
              markerLen = '__SIMPLEOJ_WAITING_INPUT__'.length;
              nextState = 'WAITING_INPUT';
            } else if (idxRunning !== -1) {
              markerIndex = idxRunning;
              markerLen = '__SIMPLEOJ_RUNNING__'.length;
              nextState = 'RUNNING';
            }
            
            if (markerIndex === -1) {
              // Extract safe prefix to output immediately to avoid holding normal stderr.
              // We reserve space for a potential partial marker at the end of buffer.
              let safeLen = stderrBuffer.length;
              const markerPrefix = '__SIMPLEOJ_';
              const lastPrefixIdx = stderrBuffer.lastIndexOf(markerPrefix);
              // Max length of any marker is 26 characters
              if (lastPrefixIdx !== -1 && lastPrefixIdx >= stderrBuffer.length - 30) {
                safeLen = lastPrefixIdx;
              }
              
              if (safeLen > 0) {
                this.output(stderrBuffer.slice(0, safeLen));
                stderrBuffer = stderrBuffer.slice(safeLen);
              }
              break;
            }
            
            // Output normal stderr prior to the marker
            if (markerIndex > 0) {
              this.output(stderrBuffer.slice(0, markerIndex));
            }
            
            // Transition state
            this.setProcessState(nextState);
            
            // Slice the buffer past the marker and any trailing newlines
            let endOfMarker = markerIndex + markerLen;
            stderrBuffer = stderrBuffer.slice(endOfMarker);
            if (stderrBuffer.startsWith('\r')) {
              stderrBuffer = stderrBuffer.slice(1);
            }
            if (stderrBuffer.startsWith('\n')) {
              stderrBuffer = stderrBuffer.slice(1);
            }
          }
        });

        this.process.on('error', (error) => {
          console.error('Python terminal process error:', error);
          this.output(`\r\n[Runner error: không thể khởi động môi trường chạy Python]\r\n`);
        });
        this.process.on('close', (code, signal) => {
          runningProcesses.delete(proc);
          if (stderrBuffer) {
            this.output(stderrBuffer);
          }
          if (!this.processKilledReason) {
            if (signal === 'SIGSEGV' || signal === 'SIGKILL' || code === 139 || code === 137) {
              this.output('\r\n[Memory limit exceeded: chương trình dùng quá nhiều bộ nhớ]\r\n');
            }
          }
          this.finishProcess(code);
        });
      } catch (error) {
        this.process = null;
        this.processKind = null;
        console.error('Failed to start python process in terminal:', error);
        this.output(`\r\n[Runner error: không thể khởi động môi trường chạy Python]\r\n`);
        sendJson(this.ws, { type: 'exit', code: 1 });
        return;
      }
    }

    sendJson(this.ws, { type: 'start', runtime: this.processKind });
    this.processKilledReason = null;

    if (mode === 'main.py') {
      // Initialize main.py process state
      this.processState = 'RUNNING';
      this.runningTimeLeft = config.pythonRunningTimeoutMs;
      this.lastRunningStartTime = Date.now();
      
      // Active CPU timeout for the initial running phase
      this.processActiveTimer = setTimeout(() => {
        this.output('\r\n[Time limit exceeded: chương trình chạy quá thời gian cho phép]\r\n');
        this.processKilledReason = 'TIMEOUT';
        this.interrupt();
      }, config.pythonRunningTimeoutMs);

      // Total lifetime timeout
      const totalMinutes = Math.floor(config.pythonTotalTimeoutMs / 60000);
      const totalSeconds = Math.floor((config.pythonTotalTimeoutMs % 60000) / 1000);
      const timeStr = totalMinutes > 0 ? `${totalMinutes} phút` : `${totalSeconds} giây`;
      this.processLifetimeTimer = setTimeout(() => {
        this.output(`\r\n[Chương trình đã quá thời lượng hoạt động tối đa ${timeStr}. Đang dừng...]\r\n`);
        this.processKilledReason = 'TIMEOUT';
        this.killActiveProcess();
      }, config.pythonTotalTimeoutMs);
    } else if (mode === '--repl') {
      this.resetReplIdleTimer();

      // REPL total lifetime: 5 minutes (300 seconds)
      this.replLifetimeTimer = setTimeout(() => {
        this.output('\r\n[REPL đã đạt giới hạn hoạt động tối đa 5 phút. Đang dừng...]\r\n');
        this.killActiveProcess();
      }, 300000);
      
      if (this.processKind === 'spawn') {
        this.output('\r\n# REPL đang ở chế độ basic (thiếu node-pty).\r\n');
      }
    }
  }

  setProcessState(newState) {
    if (this.closed || !this.process) return;
    if (this.processState === newState) return;
    
    // Clear state-specific timers
    clearTimeout(this.processActiveTimer);
    clearTimeout(this.processInputTimer);
    this.processActiveTimer = null;
    this.processInputTimer = null;
    
    if (newState === 'WAITING_INPUT') {
      // Calculate CPU time consumed during the RUNNING state
      const elapsed = Date.now() - this.lastRunningStartTime;
      this.runningTimeLeft = Math.max(0, this.runningTimeLeft - elapsed);
      this.processState = 'WAITING_INPUT';
      
      // Set input idle timeout
      this.processInputTimer = setTimeout(() => {
        this.output('\r\n[Input timeout: chương trình đã chờ nhập quá lâu]\r\n');
        this.processKilledReason = 'INPUT_TIMEOUT';
        this.killActiveProcess();
      }, config.pythonInputTimeoutMs);
    } 
    else if (newState === 'RUNNING') {
      this.processState = 'RUNNING';
      this.lastRunningStartTime = Date.now();
      
      // Set active CPU timeout for the remaining time
      const limit = Math.max(0, this.runningTimeLeft);
      this.processActiveTimer = setTimeout(() => {
        this.output('\r\n[Time limit exceeded: chương trình chạy quá thời gian cho phép]\r\n');
        this.processKilledReason = 'TIMEOUT';
        this.interrupt();
      }, limit);
    }
  }

  resetReplIdleTimer() {
    clearTimeout(this.replIdleTimer);
    this.replIdleTimer = setTimeout(() => {
      this.output('\r\n[REPL tự động đóng do không hoạt động trong 120 giây]\r\n');
      this.killActiveProcess();
    }, 120000); // 2 minutes idle timeout
  }

  async interrupt() {
    if (!this.process) return;
    this.output('^C\r\n');
    const proc = this.process;
    try {
      proc.kill('SIGINT');
    } catch (e) {}
    
    setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch (e) {}
    }, 1000);
  }

  stopProcess(signal = 'SIGKILL') {
    if (!this.process) return;
    try { this.process.kill(signal); } catch { /* already exited */ }
  }

  async finishProcess(code = 0) {
    clearTimeout(this.processActiveTimer);
    clearTimeout(this.processInputTimer);
    clearTimeout(this.processLifetimeTimer);
    clearTimeout(this.replIdleTimer);
    clearTimeout(this.replLifetimeTimer);
    
    this.processActiveTimer = null;
    this.processInputTimer = null;
    this.processLifetimeTimer = null;
    this.replIdleTimer = null;
    this.replLifetimeTimer = null;
    
    const proc = this.process;
    this.process = null;
    this.processKind = null;
    if (proc) {
      runningProcesses.delete(proc);
    }

    if (this.workdir) {
      await fs.rm(path.join(this.workdir, 'main.py'), { force: true }).catch(() => {});
    }

    sendJson(this.ws, { type: 'exit', code });
  }

  async killActiveProcess() {
    if (!this.process) return;
    const proc = this.process;
    
    clearTimeout(this.processActiveTimer);
    clearTimeout(this.processInputTimer);
    clearTimeout(this.processLifetimeTimer);
    clearTimeout(this.replIdleTimer);
    clearTimeout(this.replLifetimeTimer);
    
    this.processActiveTimer = null;
    this.processInputTimer = null;
    this.processLifetimeTimer = null;
    this.replIdleTimer = null;
    this.replLifetimeTimer = null;
    
    this.process = null;
    this.processKind = null;
    
    runningProcesses.delete(proc);

    try { proc.kill('SIGINT'); } catch (e) {}
    
    await new Promise((resolve) => {
      const checkTimer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (e) {}
        resolve();
      }, 1000);
      
      proc.once('close', () => {
        clearTimeout(checkTimer);
        resolve();
      });
      proc.once('exit', () => {
        clearTimeout(checkTimer);
        resolve();
      });
    });
  }

  async close(code, reason) {
    if (this.closed) return;
    this.closed = true;
    
    clearTimeout(this.idleTimer);
    clearTimeout(this.processActiveTimer);
    clearTimeout(this.processInputTimer);
    clearTimeout(this.processLifetimeTimer);
    clearTimeout(this.replIdleTimer);
    clearTimeout(this.replLifetimeTimer);
    
    const proc = this.process;
    this.stopProcess('SIGKILL');
    if (proc) {
      runningProcesses.delete(proc);
    }
    
    if (this.ws.readyState === WebSocket.OPEN) this.ws.close(code, reason);
    if (this.workdir) {
      await fs.rm(this.workdir, { recursive: true, force: true }).catch(() => {});
      this.workdir = null;
    }
  }
  validateMessageSchema(message) {
    if (!message || typeof message !== 'object') return false;
    const validTypes = ['runFile', 'startRepl', 'stdin', 'interrupt', 'dispose'];
    if (!validTypes.includes(message.type)) return false;
    if (message.type === 'runFile' && typeof message.code !== 'string') return false;
    if (message.type === 'stdin' && typeof message.data !== 'string') return false;
    return true;
  }
}

export function attachTerminalServer(server) {
  const wsServer = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });

  server.on('upgrade', async (request, socket, head) => {
    let pathname;
    try { pathname = new URL(request.url, 'http://localhost').pathname; } catch { return rejectUpgrade(socket, '400 Bad Request', 'Bad request'); }
    if (pathname !== '/ws/terminal') return rejectUpgrade(socket, '404 Not Found', 'Not found');

    if (!config.serverTerminalEnabled || config.terminalRunner !== 'server') {
      return rejectUpgrade(socket, '403 Forbidden', 'Server-side terminal is disabled');
    }

    const user = await authenticate(request);
    if (!user) return rejectUpgrade(socket, '401 Unauthorized', 'Authentication required');

    wsServer.handleUpgrade(request, socket, head, (ws) => {
      wsServer.emit('connection', ws, request, user);
    });
  });

  wsServer.on('connection', async (ws, _request, user) => {
    const existingSession = activeSessions.get(user.id);
    if (existingSession) {
      await existingSession.close(4000, 'Phiên hoạt động mới đã được mở.').catch(() => {});
    }

    const session = new TerminalSession(ws, user);
    activeSessions.set(user.id, session);
    
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (activeSessions.get(user.id) === session) {
        activeSessions.delete(user.id);
      }
      session.close().catch(() => {});
    };
    
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (!session.validateMessageSchema(msg)) {
          sendJson(ws, { type: 'error', message: '[Terminal protocol error]' });
          return;
        }
        session.handle(msg).catch((error) => {
          console.error('Terminal session handle error:', error);
          sendJson(ws, { type: 'error', message: 'Lỗi thực thi terminal.' });
        });
      } catch (err) {
        sendJson(ws, { type: 'error', message: '[Terminal protocol error]' });
      }
    });
    ws.on('close', release);
    ws.on('error', release);
    
    try {
      await session.start();
    } catch (error) {
      sendJson(ws, { type: 'error', message: `Không tạo được phiên terminal: ${error.message}` });
      release();
    }
  });

  return wsServer;
}
```

### File: `src/validation.js`

```javascript
export function cleanText(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

export function normalizeEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

export function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeProblem(body) {
  const examples = Array.isArray(body.examples) ? body.examples.slice(0, 10) : [];
  const testcases = Array.isArray(body.testcases) ? body.testcases.slice(0, 200) : [];
  
  let rating = 800;
  if (body.rating !== undefined && body.rating !== '') {
    rating = Number(body.rating);
  } else if (body.difficultyLevel !== undefined || body.difficulty_level !== undefined) {
    const df = Number(body.difficultyLevel ?? body.difficulty_level);
    if (df === 1) rating = 800;
    else if (df === 2) rating = 1200;
    else if (df === 3) rating = 1600;
  } else if (body.difficulty) {
    const dfStr = String(body.difficulty).trim();
    if (dfStr === 'Dễ') rating = 800;
    else if (dfStr === 'Trung bình') rating = 1200;
    else if (dfStr === 'Khó') rating = 1600;
  }

  return {
    slug: body.slug !== undefined ? String(body.slug).trim().toLowerCase() : (body.id !== undefined ? String(body.id).trim().toLowerCase() : ''),
    title: body.title !== undefined ? String(body.title).trim() : '',
    difficulty: cleanText(body.difficulty || 'Dễ', 40),
    rating: rating,
    maxScore: body.maxScore ?? body.max_score ?? 100,
    passingScore: body.passingScore ?? body.passing_score ?? 100,
    publishedAt: body.publishedAt ?? body.published_at ? new Date(body.publishedAt ?? body.published_at).toISOString() : new Date().toISOString(),
    source: body.source ? String(body.source).trim().slice(0, 1000) : null,
    orderIndex: body.orderIndex ?? body.order_index ?? 0,
    description: body.description !== undefined ? String(body.description).trim() : '',
    starterCode: String(body.starterCode ?? body.template ?? '').slice(0, 20000),
    examples: examples.map((x) => ({
      input: x.input !== undefined ? String(x.input).slice(0, 10000) : '',
      output: x.output !== undefined ? String(x.output).slice(0, 10000) : '',
      explanation: x.explanation !== undefined ? cleanText(x.explanation, 1000) : ''
    })),
    testcases: testcases.map((x, idx) => ({
      input: x.input !== undefined ? String(x.input).slice(0, 10000) : '',
      output: (x.output !== undefined || x.expected_output !== undefined)
        ? String(x.output ?? x.expected_output ?? '').slice(0, 10000)
        : undefined,
      explanation: x.explanation !== undefined ? cleanText(x.explanation, 1000) : '',
      isPublic: Boolean(x.isPublic ?? x.is_public ?? false),
      weight: x.weight !== undefined ? Number(x.weight) : 1,
      orderIndex: x.orderIndex ?? x.order_index ?? idx
    })),
    timeLimitMinutes: body.timeLimitMinutes ?? body.time_limit_minutes ?? 30,
    executionLimitMs: body.executionLimitMs ?? body.execution_limit_ms ?? 1500,
    isActive: body.isActive ?? body.is_active ?? true,
    compareMode: cleanText(body.compareMode ?? (body.compare_mode || 'token'), 20),
    numberTolerance: body.numberTolerance ?? body.number_tolerance ?? 1e-6
  };
}

export function validateProblem(problem) {
  const errors = [];
  
  // Validate slug
  if (!problem.slug) {
    errors.push('Slug không được để trống.');
  } else {
    if (problem.slug.length < 2 || problem.slug.length > 100) {
      errors.push('Slug phải từ 2 đến 100 ký tự.');
    }
    if (/[^a-z0-9_-]/.test(problem.slug)) {
      errors.push('Slug chỉ được chứa ký tự thường (a-z), số (0-9), dấu gạch ngang (-) và gạch dưới (_).');
    }
  }

  // Validate title
  if (!problem.title) {
    errors.push('Thiếu tên bài.');
  } else if (problem.title.length > 200) {
    errors.push('Tên bài không được vượt quá 200 ký tự.');
  }

  // Validate description
  if (!problem.description) {
    errors.push('Thiếu đề bài.');
  }

  // Validate rating
  const rating = Number(problem.rating);
  if (problem.rating === undefined || isNaN(rating) || !Number.isInteger(rating) || rating < 800 || rating > 3500 || rating % 100 !== 0) {
    errors.push('Rating không hợp lệ (phải từ 800 đến 3500 và chia hết cho 100).');
  }

  // Validate passing score
  const passingScore = Number(problem.passingScore);
  if (problem.passingScore === undefined || isNaN(passingScore) || !Number.isInteger(passingScore) || passingScore < 0 || passingScore > 100) {
    errors.push('Passing score phải là số nguyên từ 0 đến 100.');
  }

  // Validate max score
  const maxScore = Number(problem.maxScore);
  if (problem.maxScore === undefined || isNaN(maxScore) || !Number.isInteger(maxScore) || maxScore < 1 || maxScore > 100) {
    errors.push('Max score phải là số nguyên từ 1 đến 100.');
  }

  // Validate time limit minutes
  const timeLimitMinutes = Number(problem.timeLimitMinutes);
  if (problem.timeLimitMinutes === undefined || isNaN(timeLimitMinutes) || !Number.isInteger(timeLimitMinutes) || timeLimitMinutes < 1 || timeLimitMinutes > 240) {
    errors.push('Thời gian giới hạn (phút) phải là số nguyên từ 1 đến 240.');
  }

  // Validate execution limit ms
  const executionLimitMs = Number(problem.executionLimitMs);
  if (problem.executionLimitMs === undefined || isNaN(executionLimitMs) || !Number.isInteger(executionLimitMs) || executionLimitMs < 250 || executionLimitMs > 5000) {
    errors.push('Giới hạn thực thi (ms) phải là số nguyên từ 250 đến 5000.');
  }

  // Validate compare mode
  if (!problem.compareMode || !['exact', 'trim', 'token', 'number'].includes(problem.compareMode)) {
    errors.push('Compare mode không hợp lệ.');
  }

  // Validate number tolerance
  const numberTolerance = Number(problem.numberTolerance);
  if (problem.compareMode === 'number') {
    if (problem.numberTolerance === undefined || isNaN(numberTolerance) || numberTolerance < 0 || numberTolerance > 1) {
      errors.push('Number tolerance phải lớn hơn hoặc bằng 0 và nhỏ hơn hoặc bằng 1.');
    }
  }

  // Validate examples
  if (!Array.isArray(problem.examples)) {
    errors.push('Examples phải là một danh sách (array).');
  } else {
    for (let i = 0; i < problem.examples.length; i++) {
      const ex = problem.examples[i];
      if (typeof ex.input !== 'string' || typeof ex.output !== 'string') {
        errors.push(`Ví dụ thứ ${i + 1} phải chứa input và output dưới dạng chuỗi (string).`);
      }
    }
  }

  // Validate testcases
  if (!Array.isArray(problem.testcases) || !problem.testcases.length) {
    errors.push('Cần ít nhất một test case.');
  } else if (problem.testcases.length > 200) {
    errors.push('Số lượng testcase không được vượt quá 200.');
  } else {
    for (let i = 0; i < problem.testcases.length; i++) {
      const tc = problem.testcases[i];
      if (typeof tc.input !== 'string') {
        errors.push(`Testcase thứ ${i + 1} có input không hợp lệ (phải là chuỗi).`);
      }
      if (tc.output === undefined) {
        errors.push(`Testcase thứ ${i + 1} thiếu expected output.`);
      } else if (typeof tc.output !== 'string') {
        errors.push(`Testcase thứ ${i + 1} có output không hợp lệ (phải là chuỗi).`);
      }
      const weight = Number(tc.weight);
      if (tc.weight === undefined || isNaN(weight) || !Number.isInteger(weight) || weight < 1 || weight > 100) {
        errors.push(`Testcase thứ ${i + 1} có trọng số (weight) không hợp lệ (phải là số nguyên từ 1 đến 100).`);
      }
      if (typeof tc.isPublic !== 'boolean') {
        errors.push(`Testcase thứ ${i + 1} có trường isPublic không hợp lệ (phải là boolean).`);
      }
    }
  }

  return errors;
}

```

### File: `test/admin-import.test.js`

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import app from '../src/server.js';
import { query } from '../src/db.js';
import { config } from '../src/config.js';

test('Admin Import API integration', async (t) => {
  let server;
  let port;
  let cookieHeader;
  let adminId;

  t.before(async () => {
    // Start temporary test server
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;

    // Get an existing admin user from DB
    const { rows } = await query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
    if (!rows[0]) {
      throw new Error('No admin user found in database. Seed the database first.');
    }
    adminId = rows[0].id;
    const token = jwt.sign({ sub: adminId, role: 'ADMIN' }, config.jwtSecret, { expiresIn: '1h' });
    cookieHeader = `simpleoj_session=${token}`;
  });

  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('Import 2 valid problems successfully', async () => {
    // Delete potential leftovers
    await query("DELETE FROM problems WHERE slug IN ('test-import-1', 'test-import-2')");

    const payload = [
      {
        slug: 'test-import-1',
        title: 'Test Import 1',
        description: 'Description 1',
        rating: 1000,
        testcases: [{ input: '1', output: '1', weight: 1, isPublic: true }]
      },
      {
        slug: 'test-import-2',
        title: 'Test Import 2',
        description: 'Description 2',
        rating: 1200,
        testcases: [{ input: '2', output: '2', weight: 10, isPublic: false }]
      }
    ];

    const res = await fetch(`http://localhost:${port}/api/admin/problems/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.imported, 2);
    assert.equal(data.created, 2);
    assert.equal(data.updated, 0);

    // Verify DB insertion
    const dbRes = await query("SELECT id, title, rating FROM problems WHERE slug = 'test-import-1'");
    assert.equal(dbRes.rows.length, 1);
    assert.equal(dbRes.rows[0].title, 'Test Import 1');
  });

  await t.test('Import 1 valid + 1 invalid fails and rolls back (atomic)', async () => {
    // Delete potential leftovers
    await query("DELETE FROM problems WHERE slug IN ('test-valid-atomic', 'test-invalid-atomic')");

    const payload = [
      {
        slug: 'test-valid-atomic',
        title: 'Valid Problem',
        description: 'Valid Desc',
        rating: 1000,
        testcases: [{ input: '1', output: '1', weight: 1, isPublic: true }]
      },
      {
        slug: 'test-invalid-atomic',
        title: 'Invalid Problem',
        description: 'Invalid because of negative weight',
        rating: 1200,
        testcases: [{ input: '2', output: '2', weight: -5, isPublic: false }] // Negative weight fails validation
      }
    ];

    const res = await fetch(`http://localhost:${port}/api/admin/problems/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 400);
    
    // Verify none were written to the DB
    const validCheck = await query("SELECT id FROM problems WHERE slug = 'test-valid-atomic'");
    assert.equal(validCheck.rows.length, 0);

    const invalidCheck = await query("SELECT id FROM problems WHERE slug = 'test-invalid-atomic'");
    assert.equal(invalidCheck.rows.length, 0);
  });

  await t.test('Re-import same slug updates details and replaces testcases', async () => {
    // Clean up
    await query("DELETE FROM problems WHERE slug = 'test-update-slug'");

    const firstPayload = [
      {
        slug: 'test-update-slug',
        title: 'Initial Title',
        description: 'Description',
        rating: 800,
        testcases: [
          { input: 'a', output: '1', weight: 1, isPublic: true },
          { input: 'b', output: '2', weight: 2, isPublic: false }
        ]
      }
    ];

    const res1 = await fetch(`http://localhost:${port}/api/admin/problems/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify(firstPayload)
    });
    assert.equal(res1.status, 200);

    // Second payload updates title and has 3 new testcases
    const secondPayload = [
      {
        slug: 'test-update-slug',
        title: 'Updated Title',
        description: 'Description',
        rating: 1000,
        testcases: [
          { input: 'c', output: '3', weight: 5, isPublic: true },
          { input: 'd', output: '4', weight: 5, isPublic: true },
          { input: 'e', output: '5', weight: 5, isPublic: true }
        ]
      }
    ];

    const res2 = await fetch(`http://localhost:${port}/api/admin/problems/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify(secondPayload)
    });

    assert.equal(res2.status, 200);
    const data = await res2.json();
    assert.equal(data.imported, 1);
    assert.equal(data.created, 0);
    assert.equal(data.updated, 1);

    // Verify DB update
    const prob = await query("SELECT id, title, rating FROM problems WHERE slug = 'test-update-slug'");
    assert.equal(prob.rows[0].title, 'Updated Title');
    assert.equal(prob.rows[0].rating, 1000);

    // Verify old testcases are deleted and only new ones exist (3 total)
    const tcs = await query("SELECT input, expected_output, weight FROM problem_testcases WHERE problem_id = $1 ORDER BY order_index ASC", [prob.rows[0].id]);
    assert.equal(tcs.rows.length, 3);
    assert.equal(tcs.rows[0].input, 'c');
    assert.equal(tcs.rows[1].input, 'd');
    assert.equal(tcs.rows[2].input, 'e');
  });

  await t.test('Import old JSON format using id, expected_output, and is_public works', async () => {
    await query("DELETE FROM problems WHERE slug = 'old-format-slug'");

    const payload = [
      {
        id: 'old-format-slug',
        title: 'Old Format Problem',
        description: 'Description',
        difficultyLevel: 2, // Maps to 1200 rating
        template: 'print("Hello")',
        testcases: [
          { input: 'in', expected_output: 'out', is_public: true }
        ]
      }
    ];

    const res = await fetch(`http://localhost:${port}/api/admin/problems/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 200);
    const dbRes = await query("SELECT id, rating, starter_code FROM problems WHERE slug = 'old-format-slug'");
    assert.equal(dbRes.rows[0].rating, 1200);
    assert.equal(dbRes.rows[0].starter_code, 'print("Hello")');

    const tcRes = await query("SELECT expected_output, is_public FROM problem_testcases WHERE problem_id = $1", [dbRes.rows[0].id]);
    assert.equal(tcRes.rows[0].expected_output, 'out');
    assert.equal(tcRes.rows[0].is_public, true);
  });
});
```

### File: `test/core.test.js`

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/auth.js';
import { normalizeProblem, validateProblem } from '../src/validation.js';
import { runPythonLocal, judgeSubmission } from '../src/judge.js';

test('password hashing verifies correct password only', () => {
  const stored = hashPassword('Secret123');
  assert.equal(verifyPassword('Secret123', stored), true);
  assert.equal(verifyPassword('Wrong123', stored), false);
  assert.notEqual(stored, 'Secret123');
});

test('problem normalization supports legacy problem shape', () => {
  const problem = normalizeProblem({ id: 'hello', title: 'Hello', description: 'Say hi', template: 'print("hi")', testcases: [{ input:'', output:'hi' }] });
  assert.equal(problem.starterCode, 'print("hi")');
  assert.deepEqual(validateProblem(problem), []);
});

test('problem rating normalization and validation', () => {
  // Check exact Codeforces rating validation
  const p1 = normalizeProblem({ id: 'p1', title: 'P1', description: 'Desc', testcases: [{ input:'', output:'x' }], rating: 1200 });
  assert.equal(p1.rating, 1200);
  assert.deepEqual(validateProblem(p1), []);

  // Check invalid rating rejection
  const p2 = normalizeProblem({ id: 'p2', title: 'P2', description: 'Desc', testcases: [{ input:'', output:'x' }], rating: 850 });
  assert.equal(p2.rating, 850);
  const errs2 = validateProblem(p2);
  assert.ok(errs2.length > 0);
  assert.ok(errs2[0].includes('Rating không hợp lệ'));

  const p3 = normalizeProblem({ id: 'p3', title: 'P3', description: 'Desc', testcases: [{ input:'', output:'x' }], rating: 400 });
  assert.ok(validateProblem(p3).length > 0);

  const p4 = normalizeProblem({ id: 'p4', title: 'P4', description: 'Desc', testcases: [{ input:'', output:'x' }], rating: 3600 });
  assert.ok(validateProblem(p4).length > 0);

  // Check legacy mapping
  const p5 = normalizeProblem({ id: 'p5', title: 'P5', description: 'Desc', testcases: [{ input:'', output:'x' }], difficultyLevel: 3 });
  assert.equal(p5.rating, 1600);

  const p6 = normalizeProblem({ id: 'p6', title: 'P6', description: 'Desc', testcases: [{ input:'', output:'x' }], difficulty: 'Trung bình' });
  assert.equal(p6.rating, 1200);
});

test('python runner captures output and runtime errors', async () => {
  const ok = await runPythonLocal('print(int(input()) * 2)', '4', 1200);
  assert.equal(ok.output.trim(), '8');
  assert.equal(ok.error, null);
  const bad = await runPythonLocal('raise ValueError("boom")', '', 1200);
  assert.match(bad.error, /ValueError: boom/);
});

test('judge scores exact normalized outputs', async () => {
  const result = await judgeSubmission('a,b=map(int,input().split());print(a+b)', [
    { input:'2 3', output:'5' }, { input:'-1 1', output:'0' }
  ], 1200, true);
  assert.equal(result.score, 100);
  assert.equal(result.passed, 2);
});

test('python runner stops infinite loops', async () => {
  const started = Date.now();
  const result = await runPythonLocal('while True: pass', '', 350);
  assert.equal(result.timedOut, true);
  assert.ok(Date.now() - started < 2000);
});
```

### File: `test/errors.test.js`

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPythonLocal, parseRunnerError, judgeSubmission } from '../src/judge.js';

test('python runner blocks prohibited imports', async () => {
  const result = await runPythonLocal('import os', '', 1200);
  assert.ok(result.error);
  assert.match(result.error, /Blocked import: os/);
  assert.match(result.error, /ImportError/);
});

test('python runner cleans traceback by removing runner internal frames', async () => {
  const result = await runPythonLocal('def f():\n    raise ValueError("custom error")\nf()', '', 1200);
  assert.ok(result.error);
  assert.match(result.error, /ValueError: custom error/);
  assert.match(result.error, /submission\.py/);
  assert.ok(!result.error.includes('python-runner.py'));
});

test('parseRunnerError maps errors correctly', () => {
  // Time Limit Exceeded
  const tle = parseRunnerError({ timedOut: true }, 1500);
  assert.equal(tle.type, 'TIME_LIMIT_EXCEEDED');
  assert.equal(tle.status, 'Time Limit Exceeded');
  assert.equal(tle.safeForUser, true);

  // Output Limit Exceeded
  const ole = parseRunnerError({ truncated: true }, 1500);
  assert.equal(ole.type, 'OUTPUT_LIMIT_EXCEEDED');
  assert.equal(ole.status, 'Output Limit Exceeded');

  // Memory Limit Exceeded
  const mle = parseRunnerError({ error: 'MemoryError: out of memory' }, 1500);
  assert.equal(mle.type, 'MEMORY_LIMIT_EXCEEDED');
  assert.equal(mle.status, 'Memory Limit Exceeded');

  // Input Limit Exceeded / EOFError
  const eof = parseRunnerError({ error: 'EOFError: EOF when reading a line' }, 1500);
  assert.equal(eof.type, 'USER_CODE_INPUT_ERROR');
  assert.equal(eof.status, 'Runtime Error');

  // Blocked Import
  const blocked = parseRunnerError({ error: '[Blocked import: os]\nImportError: import of os is blocked' }, 1500);
  assert.equal(blocked.type, 'BLOCKED_IMPORT_OR_OPERATION');
  assert.equal(blocked.status, 'Runtime Error');
  assert.match(blocked.message, /Blocked import: os/);

  // Syntax Error
  const syntax = parseRunnerError({ error: '  File "submission.py", line 2\n    if True\n          ^\nSyntaxError: expected \':\'' }, 1500);
  assert.equal(syntax.type, 'USER_CODE_SYNTAX_ERROR');
  assert.equal(syntax.status, 'Runtime Error');
  assert.equal(syntax.line, 2);

  // Runtime Error
  const runtime = parseRunnerError({ error: '  File "submission.py", line 3, in <module>\n    1/0\nZeroDivisionError: division by zero' }, 1500);
  assert.equal(runtime.type, 'USER_CODE_RUNTIME_ERROR');
  assert.equal(runtime.status, 'Runtime Error');
  assert.equal(runtime.line, 3);
  assert.match(runtime.message, /division by zero/);

  // Runner System Error
  const sysErr = parseRunnerError({ error: 'Runner error: không thể khởi động môi trường chạy Python' }, 1500);
  assert.equal(sysErr.type, 'RUNNER_SYSTEM_ERROR');
  assert.equal(sysErr.status, 'Runtime Error');
  assert.equal(sysErr.safeForUser, false);
});

test('judgeSubmission hides actual and expected inputs/outputs from reports', async () => {
  const testcases = [
    { input: '1 2', output: '3' },
    { input: '4 5', output: '9' }
  ];
  // Wrong answer submission
  const result = await judgeSubmission('print(0)', testcases, 1200, true);
  assert.equal(result.passed, 0);
  assert.equal(result.reports.length, 2);
  for (const report of result.reports) {
    assert.equal(report.passed, false);
    assert.equal(report.status, 'Wrong Answer');
    // Verify no actual/expected or inputs are leaked in the reports
    assert.equal(report.input, undefined);
    assert.equal(report.actual, undefined);
    assert.equal(report.expected, undefined);
  }
});
```

### File: `test/judge-compare.test.js`

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareOutput, judgeSubmission } from '../src/judge.js';

test('compareOutput - exact mode', () => {
  // Exact mode matches character-for-character, preserving newlines and spaces
  assert.deepEqual(compareOutput('Hello\n', 'Hello\n', { compareMode: 'exact' }), { ok: true, reason: 'Khớp hoàn toàn' });
  
  // Trailing newline difference
  const newlineDiff = compareOutput('Hello', 'Hello\n', { compareMode: 'exact' });
  assert.equal(newlineDiff.ok, false);
  
  // Spaces difference
  assert.equal(compareOutput('Hello  world', 'Hello world', { compareMode: 'exact' }).ok, false);
});

test('compareOutput - trim mode', () => {
  // Trim mode ignores leading/trailing whitespaces and newlines
  assert.deepEqual(compareOutput('  Hello\n', 'Hello', { compareMode: 'trim' }), { ok: true, reason: 'Khớp sau khi trim' });
  assert.equal(compareOutput('Hello\nworld', 'Hello  world', { compareMode: 'trim' }).ok, false);
});

test('compareOutput - token mode', () => {
  // Token mode splits by whitespace, ignoring spacing layout differences
  assert.deepEqual(compareOutput('1\n2 3', '1 2 3', { compareMode: 'token' }), { ok: true, reason: 'Khớp tokens' });
  
  const lenMismatch = compareOutput('1 2 3', '1 2', { compareMode: 'token' });
  assert.equal(lenMismatch.ok, false);
  assert.match(lenMismatch.reason, /Số lượng token không khớp/);

  const valMismatch = compareOutput('hello world', 'hello user', { compareMode: 'token' });
  assert.equal(valMismatch.ok, false);
  assert.match(valMismatch.reason, /Token thứ 2 không khớp/);
});

test('compareOutput - number mode', () => {
  // Float tolerance comparison
  assert.deepEqual(compareOutput('3.141592', '3.141593', { compareMode: 'number', numberTolerance: 1e-5 }), { ok: true, reason: 'Khớp số và ký tự' });
  
  const outOfTolerance = compareOutput('3.141592', '3.15', { compareMode: 'number', numberTolerance: 1e-5 });
  assert.equal(outOfTolerance.ok, false);
  assert.match(outOfTolerance.reason, /độ lệch tối đa/);

  // Strict numeric parser checks
  // Accept standard formats: 1, -1, 3.14, -0.5, .5, 1e-6, -2.5E+8
  assert.equal(compareOutput('1', '1.0', { compareMode: 'number' }).ok, true);
  assert.equal(compareOutput('-1', '-1.0', { compareMode: 'number' }).ok, true);
  assert.equal(compareOutput('3.14', '3.1400', { compareMode: 'number' }).ok, true);
  assert.equal(compareOutput('-0.5', '-0.5', { compareMode: 'number' }).ok, true);
  assert.equal(compareOutput('.5', '0.5', { compareMode: 'number' }).ok, true);
  assert.equal(compareOutput('1e-6', '0.000001', { compareMode: 'number' }).ok, true);
  assert.equal(compareOutput('-2.5E+8', '-250000000', { compareMode: 'number' }).ok, true);

  // Reject partials/infinities/NaN: 3abc, 1.2.3, abc, Infinity, NaN
  // They fall back to string comparison, so "3abc" !== "3"
  const partialMismatch = compareOutput('3abc', '3', { compareMode: 'number' });
  assert.equal(partialMismatch.ok, false);

  const infMismatch = compareOutput('Infinity', 'Infinity', { compareMode: 'number' });
  // Fallback to exact string match for non-numeric tokens
  assert.equal(infMismatch.ok, true); // identical string matches
  assert.equal(compareOutput('Infinity', '1000', { compareMode: 'number' }).ok, false);

  // Mixed tokens fallback to string check
  assert.equal(compareOutput('hello 3.14', 'hello 3.14', { compareMode: 'number' }).ok, true);
  assert.equal(compareOutput('hello 3.14', 'world 3.14', { compareMode: 'number' }).ok, false);
});

test('judgeSubmission - weighted score & private testcases masking', async () => {
  const code = 'import sys\nx = int(sys.stdin.read().strip())\nif x == 1:\n    print(1)\nelse:\n    print(5)\n';
  
  const testcases = [
    { input: '1', output: '1\n', weight: 1, isPublic: true },
    { input: '2', output: '4\n', weight: 3, isPublic: false }
  ];

  const result = await judgeSubmission(code, testcases, 1500, true, { compareMode: 'token' });
  
  assert.equal(result.score, 25);
  assert.equal(result.passed, 1);
  assert.equal(result.total, 2);
  
  // Public testcase: retains inputs/outputs
  const reportPublic = result.reports[0];
  assert.equal(reportPublic.passed, true);
  assert.equal(reportPublic.input, '1');
  assert.equal(reportPublic.expected, '1\n'); // normalized newline but no trim
  assert.equal(reportPublic.actual, '1\n');

  // Private testcase: masks inputs/outputs
  const reportPrivate = result.reports[1];
  assert.equal(reportPrivate.passed, false);
  assert.equal(reportPrivate.input, undefined);
  assert.equal(reportPrivate.expected, undefined);
  assert.equal(reportPrivate.actual, undefined);
});
```

### File: `test/submission-flow.test.js`

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import app from '../src/server.js';
import { query } from '../src/db.js';
import { config } from '../src/config.js';

test('Submission Flow Integration Tests', async (t) => {
  let server;
  let port;
  let adminId;
  let studentId;
  let studentCookie;

  t.before(async () => {
    // Start temporary test server
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;

    // Get or create a student user
    const { rows: existingStudents } = await query("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1");
    if (existingStudents[0]) {
      studentId = existingStudents[0].id;
    } else {
      const email = `test-student-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
      const { rows: insertedStudent } = await query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ($1, 'dummy_hash', 'Test Student', 'STUDENT')
         RETURNING id`,
        [email]
      );
      studentId = insertedStudent[0].id;
    }

    // Get an existing admin user from DB
    const { rows: existingAdmins } = await query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
    if (!existingAdmins[0]) {
      throw new Error('No admin user found in database. Seed the database first.');
    }
    adminId = existingAdmins[0].id;

    // Generate student cookie
    const token = jwt.sign({ sub: studentId, role: 'STUDENT' }, config.jwtSecret, { expiresIn: '1h' });
    studentCookie = `simpleoj_session=${token}`;
  });

  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // Helper to setup a test problem with testcases and assignment
  async function setupTestProblem({ compareMode, numberTolerance, passingScore, testcases, withAssignment = true }) {
    const slug = `test-flow-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const { rows: probRows } = await query(
      `INSERT INTO problems (slug, title, description, rating, max_score, passing_score, compare_mode, number_tolerance, created_by, is_active)
       VALUES ($1, 'Flow Problem', 'Solve it', 1200, 100, $2, $3, $4, $5, TRUE)
       RETURNING id`,
      [slug, passingScore, compareMode, numberTolerance, adminId]
    );
    const problemId = probRows[0].id;

    for (let i = 0; i < testcases.length; i++) {
      const tc = testcases[i];
      await query(
        `INSERT INTO problem_testcases (problem_id, input, expected_output, is_public, weight, order_index)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [problemId, tc.input, tc.output, tc.isPublic, tc.weight, i]
      );
    }

    if (withAssignment) {
      await query(
        `INSERT INTO student_problem_assignments (user_id, problem_id, status)
         VALUES ($1, $2, 'ASSIGNED')`,
        [studentId, problemId]
      );
    }

    return { slug, problemId };
  }

  async function cleanTestProblem(problemId) {
    await query("DELETE FROM student_problem_assignments WHERE problem_id = $1", [problemId]);
    await query("DELETE FROM user_problem_progress WHERE problem_id = $1", [problemId]);
    await query("DELETE FROM problems WHERE id = $1", [problemId]);
  }

  await t.test('Submit correct student solution scoring 100 and completing assignment', async () => {
    const testcases = [
      { input: '1\n', output: '2\n', isPublic: true, weight: 1 },
      { input: '2\n', output: '4\n', isPublic: false, weight: 3 }
    ];
    const { slug, problemId } = await setupTestProblem({
      compareMode: 'token',
      numberTolerance: 1e-6,
      passingScore: 80,
      testcases
    });

    try {
      // 1. Create attempt
      const attemptRes = await fetch(`http://localhost:${port}/api/attempts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: studentCookie },
        body: JSON.stringify({ slug })
      });
      assert.equal(attemptRes.status, 201);
      const attemptData = await attemptRes.json();
      const attemptId = attemptData.attempt.id;

      // 2. Submit solution
      // Correct solution: read number x, print x * 2
      const code = 'import sys\nx = int(sys.stdin.read().strip())\nprint(x * 2)\n';
      const submitRes = await fetch(`http://localhost:${port}/api/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: studentCookie },
        body: JSON.stringify({ attemptId, code })
      });
      assert.equal(submitRes.status, 201);
      const submitData = await submitRes.json();

      // Assert submission details
      assert.equal(submitData.submission.score, 100);
      assert.equal(submitData.submission.status, 'ACCEPTED');

      // Assert report values and masking
      const reports = submitData.reports;
      assert.equal(reports.length, 2);
      
      // Public testcase: input/output visible
      assert.equal(reports[0].passed, true);
      assert.equal(reports[0].input, '1\n');
      assert.equal(reports[0].expected, '2\n');
      assert.equal(reports[0].actual, '2\n');

      // Private testcase: input/output masked
      assert.equal(reports[1].passed, true);
      assert.equal(reports[1].input, undefined);
      assert.equal(reports[1].expected, undefined);
      assert.equal(reports[1].actual, undefined);

      // Verify progress updated & completed
      const progress = await query("SELECT completed_at, best_score FROM user_problem_progress WHERE user_id=$1 AND problem_id=$2", [studentId, problemId]);
      assert.equal(progress.rows[0].best_score, 100);
      assert.ok(progress.rows[0].completed_at !== null);

      // Verify assignment completed
      const assignment = await query("SELECT status FROM student_problem_assignments WHERE user_id=$1 AND problem_id=$2", [studentId, problemId]);
      assert.equal(assignment.rows[0].status, 'COMPLETED');
    } finally {
      await cleanTestProblem(problemId);
    }
  });

  await t.test('Submit partial solution, verifying weight score calculation and assignment status', async () => {
    // 2 testcases with weights: TC1 (weight 1), TC2 (weight 3) -> TC1 is 25%, TC2 is 75%
    const testcases = [
      { input: '1\n', output: '2\n', isPublic: true, weight: 1 },
      { input: '2\n', output: '4\n', isPublic: false, weight: 3 }
    ];
    const { slug, problemId } = await setupTestProblem({
      compareMode: 'token',
      numberTolerance: 1e-6,
      passingScore: 80,
      testcases
    });

    try {
      // 1. Create attempt
      const attemptRes = await fetch(`http://localhost:${port}/api/attempts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: studentCookie },
        body: JSON.stringify({ slug })
      });
      const attemptData = await attemptRes.json();
      const attemptId = attemptData.attempt.id;

      // 2. Submit solution that only passes TC1: prints 2 for any input
      const code = 'print(2)\n';
      const submitRes = await fetch(`http://localhost:${port}/api/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: studentCookie },
        body: JSON.stringify({ attemptId, code })
      });
      assert.equal(submitRes.status, 201);
      const submitData = await submitRes.json();

      // Assert weight scoring: 1/4 -> 25% -> 25 score
      assert.equal(submitData.submission.score, 25);
      assert.equal(submitData.submission.status, 'WRONG_ANSWER');

      // Assert report values and masking for wrong private testcase
      const reports = submitData.reports;
      assert.equal(reports.length, 2);

      // TC1 (Public, Passed)
      assert.equal(reports[0].passed, true);
      assert.equal(reports[0].input, '1\n');
      assert.equal(reports[0].expected, '2\n');
      assert.equal(reports[0].actual, '2\n');

      // TC2 (Private, Failed)
      assert.equal(reports[1].passed, false);
      assert.equal(reports[1].input, undefined);
      assert.equal(reports[1].expected, undefined);
      assert.equal(reports[1].actual, undefined);

      // Since passingScore is 80 and score is 25, the assignment must NOT be completed
      const assignment = await query("SELECT status FROM student_problem_assignments WHERE user_id=$1 AND problem_id=$2", [studentId, problemId]);
      assert.equal(assignment.rows[0].status, 'ASSIGNED');

      const progress = await query("SELECT completed_at FROM user_problem_progress WHERE user_id=$1 AND problem_id=$2", [studentId, problemId]);
      assert.equal(progress.rows[0].completed_at, null);
    } finally {
      await cleanTestProblem(problemId);
    }
  });

  await t.test('Submit partial solution achieving passing_score completes assignment', async () => {
    // 2 testcases with weights: TC1 (weight 1), TC2 (weight 3) -> TC2 is 75%
    const testcases = [
      { input: '1\n', output: '2\n', isPublic: true, weight: 1 },
      { input: '2\n', output: '4\n', isPublic: false, weight: 3 }
    ];
    // Passing score is 70
    const { slug, problemId } = await setupTestProblem({
      compareMode: 'token',
      numberTolerance: 1e-6,
      passingScore: 70,
      testcases
    });

    try {
      // 1. Create attempt
      const attemptRes = await fetch(`http://localhost:${port}/api/attempts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: studentCookie },
        body: JSON.stringify({ slug })
      });
      const attemptData = await attemptRes.json();
      const attemptId = attemptData.attempt.id;

      // 2. Submit solution that only passes TC2: prints 4 for any input
      const code = 'print(4)\n';
      const submitRes = await fetch(`http://localhost:${port}/api/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: studentCookie },
        body: JSON.stringify({ attemptId, code })
      });
      assert.equal(submitRes.status, 201);
      const submitData = await submitRes.json();

      // Assert weight scoring: 3/4 -> 75% -> 75 score
      assert.equal(submitData.submission.score, 75);

      // Since passingScore is 70 and score is 75 (score >= passingScore), the assignment MUST be COMPLETED
      const assignment = await query("SELECT status FROM student_problem_assignments WHERE user_id=$1 AND problem_id=$2", [studentId, problemId]);
      assert.equal(assignment.rows[0].status, 'COMPLETED');

      const progress = await query("SELECT completed_at FROM user_problem_progress WHERE user_id=$1 AND problem_id=$2", [studentId, problemId]);
      assert.ok(progress.rows[0].completed_at !== null);
    } finally {
      await cleanTestProblem(problemId);
    }
  });

  await t.test('Verify that /api/health returns correct and safe health diagnostics', async () => {
    const res = await fetch(`http://localhost:${port}/api/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.database, true);
    assert.equal(data.migrations, true);
    assert.equal(data.runner, true);
    assert.equal(data.python, true);
    assert.equal(data.judge, 'local');
    assert.equal(data.jwtSecret, undefined);
    assert.equal(data.databaseUrl, undefined);
  });
});
```

### File: `vercel.json`

```json
{
  "version": 2,
  "builds": [{ "src": "src/server.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "src/server.js" }]
}
```

