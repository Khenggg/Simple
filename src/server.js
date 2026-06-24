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
import { judgeSubmission, runPythonLocal, parseRunnerError } from './judge.js';
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

  // Handle tab-specific filters
  if (tab === 'todo') {
    whereConditions.push('COALESCE(upp.submission_count, 0) = 0');
  } else if (tab === 'attempted') {
    whereConditions.push('COALESCE(upp.submission_count, 0) > 0 AND upp.completed_at IS NULL AND COALESCE(upp.best_score, 0) < p.passing_score AND COALESCE(upp.best_status, \'\') != \'ACCEPTED\'');
  } else if (tab === 'done' || tab === 'completed') {
    whereConditions.push('(upp.completed_at IS NOT NULL OR COALESCE(upp.best_score, 0) >= p.passing_score OR upp.best_status = \'ACCEPTED\')');
  } else if (tab === 'assigned') {
    whereConditions.push('aa.problem_id IS NOT NULL AND NOT (upp.completed_at IS NOT NULL OR COALESCE(upp.best_score, 0) >= p.passing_score OR upp.best_status = \'ACCEPTED\')');
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
  const isDoneTab = tab === 'done' || tab === 'completed';
  if (parsedMinScore !== null) {
    queryParams.push(parsedMinScore);
    const col = isDoneTab ? 'COALESCE(upp.best_score, 0)' : 'p.max_score';
    whereConditions.push(`${col} >= $${queryParams.length}`);
  }
  if (parsedMaxScore !== null) {
    queryParams.push(parsedMaxScore);
    const col = isDoneTab ? 'COALESCE(upp.best_score, 0)' : 'p.max_score';
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

  if (isDoneTab) {
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
      sortField = 'p.published_at';
      jsFieldName = 'publishedAt';
    }
  }

  // Filter assigned
  if (assigned === 'only') {
    whereConditions.push('aa.problem_id IS NOT NULL AND NOT (upp.completed_at IS NOT NULL OR COALESCE(upp.best_score, 0) >= p.passing_score OR upp.best_status = \'ACCEPTED\')');
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

  // If no tab is specified, return all items without pagination for backward compatibility with loadProblems()
  const usePagination = tab !== undefined && tab !== '';
  const limit = usePagination ? Math.min(20, Math.max(1, Number(req.query.limit || 10))) : 10000;
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
      p.source,
      p.order_index AS "orderIndex",
      p.published_at AS "publishedAt",
      p.time_limit_minutes AS "timeLimitMinutes",
      p.max_score AS "maxScore",
      p.passing_score AS "passingScore",
      COALESCE(upp.best_score, 0)::int AS "bestScore",
      upp.best_status AS "bestStatus",
      COALESCE(upp.submission_count, 0)::int AS "submissionCount",
      upp.last_submitted_at AS "lastSubmittedAt",
      upp.completed_at AS "completedAt",
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
            AND (upp.completed_at IS NOT NULL OR COALESCE(upp.best_score, 0) >= p.passing_score OR upp.best_status = 'ACCEPTED')
        )
        THEN TRUE ELSE FALSE
      END AS "isAssigned"
    FROM problems p
    LEFT JOIN user_problem_progress upp ON upp.problem_id = p.id AND upp.user_id = $1
    LEFT JOIN active_assignments aa ON aa.problem_id = p.id
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY ${sortField} ${sortOrder}, p.id ${sortOrder}
    LIMIT ${limitPlaceholder}
  `;

  const { rows } = await query(querySql, queryParams);
  const hasMore = usePagination ? (rows.length > limit) : false;
  const rawItems = hasMore ? rows.slice(0, limit) : rows;

  function getRatingLabel(r) {
    if (r >= 800 && r <= 1000) return 'Cơ bản';
    if (r >= 1100 && r <= 1300) return 'Dễ';
    if (r >= 1400 && r <= 1600) return 'Trung bình';
    if (r >= 1700 && r <= 1900) return 'Khó';
    return 'Nâng cao';
  }

  const items = rawItems.map((item) => {
    const submissionCount = Number(item.submissionCount || 0);
    const bestScore = Number(item.bestScore || 0);
    const bestStatus = item.bestStatus || null;
    const completedAt = item.completedAt || null;
    const passingScore = Number(item.passingScore || 100);

    const isAttempted = submissionCount > 0;
    const isCompleted = completedAt !== null || bestStatus === 'ACCEPTED' || bestScore >= passingScore;
    const isAssigned = Boolean(item.isAssigned);
    const uiStatus = isCompleted ? 'completed' : isAttempted ? 'attempted' : isAssigned ? 'assigned' : 'not_started';

    return {
      id: item.id,
      slug: item.slug,
      title: item.title,
      difficulty: item.difficulty,
      rating: item.rating,
      ratingLabel: getRatingLabel(item.rating),
      source: item.source,
      orderIndex: item.orderIndex,
      publishedAt: item.publishedAt,
      timeLimitMinutes: item.timeLimitMinutes,
      bestScore,
      bestStatus,
      submissionCount,
      lastSubmittedAt: item.lastSubmittedAt,
      completedAt,
      isCompleted,
      isAttempted,
      isAssigned,
      uiStatus
    };
  });

  if (!usePagination) {
    return res.json({ problems: items });
  }

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
    ? await judgeSubmission(code, [{ input, output: '', isPublic: true }], 2000)
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

app.get('/api/submissions/:id', requireAuth, asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { rows } = await query(
    `SELECT s.id, s.problem_id AS "problemId", p.slug, p.title, s.code, s.status, s.score,
            s.passed_count AS "passedCount", s.total_count AS "totalCount",
            s.duration_ms AS "durationMs", s.report, s.created_at AS "createdAt",
            s.user_id AS "userId"
     FROM submissions s
     JOIN problems p ON p.id = s.problem_id
     WHERE s.id = $1`,
    [id]
  );
  const submission = rows[0];
  if (!submission) return res.status(404).json({ error: 'Không tìm thấy bài nộp.' });

  if (req.user.role !== 'ADMIN' && submission.userId !== req.user.id) {
    return res.status(403).json({ error: 'Không có quyền truy cập bài nộp này.' });
  }

  delete submission.userId;
  res.json({ submission });
}));

app.get('/api/problems/:slug/progress', requireAuth, asyncRoute(async (req, res) => {
  const { slug } = req.params;
  const { rows: probRows } = await query(
    `SELECT id, max_score, passing_score FROM problems WHERE slug = $1 AND (is_active = TRUE OR $2 = 'ADMIN')`,
    [slug, req.user.role]
  );
  const problem = probRows[0];
  if (!problem) return res.status(404).json({ error: 'Không tìm thấy bài tập.' });

  const { rows: progressRows } = await query(
    `SELECT
       problem_id AS "problemId",
       best_submission_id AS "bestSubmissionId",
       best_score AS "bestScore",
       best_status AS "bestStatus",
       submission_count AS "submissionCount",
       last_submitted_at AS "lastSubmittedAt",
       completed_at AS "completedAt"
     FROM user_problem_progress
     WHERE user_id = $1 AND problem_id = $2`,
    [req.user.id, problem.id]
  );

  const progressObj = progressRows[0];
  const submissionCount = Number(progressObj?.submissionCount || 0);
  const bestScore = Number(progressObj?.bestScore || 0);
  const bestStatus = progressObj?.bestStatus || null;
  const completedAt = progressObj?.completedAt || null;
  const passingScore = Number(problem.passing_score || 100);

  const isAttempted = submissionCount > 0;
  const isCompleted = completedAt !== null || bestStatus === 'ACCEPTED' || bestScore >= passingScore;

  const { rows: recentSubmissions } = await query(
    `SELECT id, status, score,
            passed_count AS "passedCount", total_count AS "totalCount",
            duration_ms AS "durationMs", created_at AS "createdAt"
     FROM submissions
     WHERE user_id = $1 AND problem_id = $2
     ORDER BY created_at DESC
     LIMIT 50`,
    [req.user.id, problem.id]
  );

  res.json({
    progress: {
      problemId: problem.id,
      slug,
      bestSubmissionId: progressObj?.bestSubmissionId || null,
      bestScore,
      bestStatus,
      submissionCount,
      lastSubmittedAt: progressObj?.lastSubmittedAt || null,
      completedAt,
      isAttempted,
      isCompleted,
      recentSubmissions
    }
  });
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
