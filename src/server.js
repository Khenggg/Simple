import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
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

app.get('/api/health', asyncRoute(async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true, judge: config.judgeServiceUrl ? 'remote' : 'local' });
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
         COALESCE((SELECT MAX(s.score) FROM submissions s WHERE s.problem_id=p.id AND s.user_id=$1), 0)::int AS best_score
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
    whereConditions.push('ap.problem_id IS NOT NULL');
  } else if (assigned === 'free') {
    whereConditions.push('ap.problem_id IS NULL');
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
    WITH user_classrooms AS (
      SELECT classroom_id FROM classroom_members WHERE user_id = $1
    ),
    assigned_problems AS (
      SELECT DISTINCT pa.problem_id
      FROM problem_assignments pa
      JOIN problem_assignment_targets pat ON pat.assignment_id = pa.id
      WHERE
        pat.target_type = 'ALL'
        OR (pat.target_type = 'CLASSROOM' AND pat.classroom_id IN (SELECT classroom_id FROM user_classrooms))
        OR (pat.target_type = 'STUDENT' AND pat.user_id = $1)
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
      CASE WHEN ap.problem_id IS NOT NULL THEN TRUE ELSE FALSE END AS "isAssigned",
      p.published_at AS "publishedAt",
      upp.last_submitted_at AS "lastSubmittedAt",
      upp.completed_at AS "completedAt",
      p.time_limit_minutes AS "timeLimitMinutes"
    FROM ${tab === 'done' ? 'user_problem_progress upp JOIN problems p ON p.id = upp.problem_id' : 'problems p LEFT JOIN user_problem_progress upp ON upp.problem_id = p.id AND upp.user_id = $1'}
    LEFT JOIN assigned_problems ap ON ap.problem_id = p.id
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
    return res.json({ output: report.actual || '', error: report.error });
  }
  res.json(result);
}));

app.post('/api/submissions', requireAuth, asyncRoute(async (req, res) => {
  const code = String(req.body.code || '').slice(0, 30000);
  if (!code.trim()) return res.status(400).json({ error: 'Chưa có code để nộp.' });
  const attemptResult = await query(
    `SELECT a.*,p.execution_limit_ms,p.id AS problem_id,p.passing_score
     FROM attempts a JOIN problems p ON p.id=a.problem_id
     WHERE a.id=$1 AND a.user_id=$2`,
    [req.body.attemptId, req.user.id]
  );
  const attempt = attemptResult.rows[0];
  if (!attempt) return res.status(404).json({ error: 'Lượt làm không tồn tại.' });
  if (attempt.status !== 'IN_PROGRESS') return res.status(409).json({ error: 'Lượt làm này đã kết thúc.' });

  // Query test cases from problem_testcases
  const { rows: testcases } = await query(
    `SELECT input, expected_output AS output FROM problem_testcases WHERE problem_id=$1 ORDER BY order_index ASC`,
    [attempt.problem_id]
  );

  const now = Date.now();
  const started = new Date(attempt.started_at).getTime();
  const expired = now > new Date(attempt.deadline_at).getTime();
  let judged = { passed: 0, total: testcases.length, score: 0, reports: [] };
  let status = 'EXPIRED';
  if (!expired) {
    judged = await judgeSubmission(code, testcases, attempt.execution_limit_ms);
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
    return client.query(
      `INSERT INTO submissions(user_id,problem_id,attempt_id,code,status,score,passed_count,total_count,duration_ms,report)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       RETURNING id,status,score,passed_count,total_count,duration_ms,created_at`,
      [req.user.id, attempt.problem_id, attempt.id, code, status, judged.score, judged.passed,
        judged.total, Math.max(0, now - started), JSON.stringify(judged.reports)]
    );
  });

  const submission = saved.rows[0];
  try {
    // Update progress in a safe post-commit block
    await query(
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
  } catch (progressErr) {
    console.error('Failed to update user_problem_progress:', progressErr);
  }

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
      `INSERT INTO problems(slug,title,difficulty,rating,max_score,passing_score,published_at,source,order_index,description,starter_code,examples,time_limit_minutes,execution_limit_ms,is_active,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16) RETURNING *`,
      [p.slug, p.title, p.difficulty, p.rating, p.maxScore, p.passingScore, p.publishedAt, p.source, p.orderIndex,
        p.description, p.starterCode, JSON.stringify(p.examples), p.timeLimitMinutes, p.executionLimitMs, p.isActive, req.user.id]
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
         time_limit_minutes=$13,execution_limit_ms=$14,is_active=$15,updated_at=NOW()
       WHERE id=$16 RETURNING *`,
      [p.slug, p.title, p.difficulty, p.rating, p.maxScore, p.passingScore, p.publishedAt, p.source, p.orderIndex,
        p.description, p.starterCode, JSON.stringify(p.examples), p.timeLimitMinutes, p.executionLimitMs, p.isActive, req.params.id]
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
  const normalized = items.map((item) => normalizeProblem({ ...item, slug: item.slug || item.id }));
  const invalid = normalized.find((p) => validateProblem(p).length);
  if (invalid) return res.status(400).json({ error: `Bài ${invalid.slug || '(không tên)'} không hợp lệ.` });
  await transaction(async (client) => {
    for (const p of normalized) {
      const { rows } = await client.query(
        `INSERT INTO problems(slug,title,difficulty,rating,max_score,passing_score,published_at,source,order_index,description,starter_code,examples,time_limit_minutes,execution_limit_ms,is_active,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16)
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
           updated_at=NOW()
         RETURNING id`,
        [p.slug, p.title, p.difficulty, p.rating, p.maxScore, p.passingScore, p.publishedAt, p.source, p.orderIndex,
          p.description, p.starterCode, JSON.stringify(p.examples), p.timeLimitMinutes, p.executionLimitMs, p.isActive, req.user.id]
      );
      const problemId = rows[0].id;
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
  res.json({ imported: normalized.length });
}));

app.get('/api/admin/users', requireAdmin, asyncRoute(async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id,u.email,u.full_name,u.role,u.is_active,u.created_at,COUNT(s.id)::int AS submissions,
       COALESCE(MAX(s.score),0)::int AS best_score FROM users u LEFT JOIN submissions s ON s.user_id=u.id
     GROUP BY u.id ORDER BY u.created_at DESC LIMIT 300`
  );
  res.json({ users: rows });
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
  res.json(await judgeSubmission(code, testcases, Number(req.body.limitMs) || 1500, true));
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

if (!process.env.VERCEL) server.listen(config.port, '0.0.0.0', () => console.log(`SimpleOJ listening on http://0.0.0.0:${config.port}`));

export default app;
export { server };
