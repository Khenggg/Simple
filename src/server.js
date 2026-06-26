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
import { maskSubmissionReportForStudent, normalizeSubmissionReport } from './report-utils.js';
import {
  assertActiveGroupsExist,
  assertActiveProblemsExist,
  assertGroupWillNotBeEmpty,
  assertProblemsWillNotBeOrphaned,
  assignProblemGroups,
  syncGroupProblems
} from './problem-groups.js';
import {
  normalizeUserInput,
  validateUserCreate,
  validateUserUpdate,
  assertCanModifyUserAdmin,
  safeUserRow,
  getUserUsageCounts
} from './users-admin.js';

const app = express();
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginEmbedderPolicy: { policy: 'require-corp' }
}));
// admin problem routes
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(optionalAuth);
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use('/api/run', rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));
app.use('/api/submissions', rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }));

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const ASSIGNMENT_STATUSES = new Set(['ASSIGNED', 'COMPLETED', 'CANCELLED']);
const SUBMISSION_STATUSES = new Set([
  'ACCEPTED',
  'WRONG_ANSWER',
  'RUNTIME_ERROR',
  'TIME_LIMIT',
  'MEMORY_LIMIT',
  'OUTPUT_LIMIT',
  'EXPIRED'
]);

function normalizeAssignmentStatusFilter(value) {
  const normalized = String(value || 'all').toUpperCase();
  return ASSIGNMENT_STATUSES.has(normalized) ? normalized : 'all';
}

function parsePositiveInt(value, fallback, max = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseScore(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, parsed));
}

function normalizeSubmissionStatus(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return SUBMISSION_STATUSES.has(normalized) ? normalized : null;
}

function normalizeSubmissionSort(value) {
  const normalized = String(value || 'newest').trim().toLowerCase();
  if (normalized === 'oldest') return 'oldest';
  if (normalized === 'score_desc') return 'score_desc';
  if (normalized === 'score_asc') return 'score_asc';
  return 'newest';
}

function getFirstFailedReport(report) {
  if (!Array.isArray(report)) return null;
  return report.find((item) => {
    const status = String(item?.status || item?.verdict || '').trim().toLowerCase();
    if (status) return !['accepted', 'ok', 'passed'].includes(status);
    return item?.passed === false;
  }) || null;
}

function normalizeSubmissionDateFilter(value, { endOfDay = false } = {}) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return endOfDay ? `${trimmed}T23:59:59.999Z` : `${trimmed}T00:00:00.000Z`;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
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

app.get('/api/auth/me', (req, res) => res.json({
  user: req.user || null,
  terminalRunner: config.terminalRunner,
  serverTerminalEnabled: config.serverTerminalEnabled
}));

app.get('/api/problems', requireAuth, asyncRoute(async (req, res) => {
  const { tab, cursor, rating, minRating, maxRating, minScore, maxScore, assigned, sort, uploadedFrom, uploadedTo, group, groupId } = req.query;

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

  // Filter by group slug
  if (group) {
    queryParams.push(group);
    whereConditions.push(`p.id IN (
      SELECT pgi.problem_id FROM problem_group_items pgi
      JOIN problem_groups pg ON pg.id = pgi.group_id
      WHERE pg.slug = $${queryParams.length} AND pg.is_active = TRUE
    )`);
  }

  // Filter by group ID
  if (groupId) {
    queryParams.push(groupId);
    whereConditions.push(`p.id IN (
      SELECT pgi.problem_id FROM problem_group_items pgi
      JOIN problem_groups pg ON pg.id = pgi.group_id
      WHERE pg.id = $${queryParams.length} AND pg.is_active = TRUE
    )`);
  }

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
      p.is_active AS "isActive",
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
      isActive: item.isActive,
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

  // Fetch and attach groups
  if (items.length > 0) {
    const problemIds = items.map(item => item.id);
    const { rows: groupRows } = await query(
      `SELECT pgi.problem_id, pg.id, pg.slug, pg.name, pg.group_type AS "groupType", pg.color, pg.icon
       FROM problem_group_items pgi
       JOIN problem_groups pg ON pg.id = pgi.group_id
       WHERE pgi.problem_id = ANY($1) AND pg.is_active = TRUE`,
      [problemIds]
    );
    for (const item of items) {
      item.groups = groupRows
        .filter(gr => gr.problem_id === item.id)
        .map(gr => ({
          id: gr.id,
          slug: gr.slug,
          name: gr.name,
          groupType: gr.groupType,
          color: gr.color,
          icon: gr.icon
        }));
    }
  } else {
    for (const item of items) {
      item.groups = [];
    }
  }

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

app.get('/api/problem-groups', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await query(
    `SELECT pg.id, pg.slug, pg.name, pg.description, pg.group_type AS "groupType",
            pg.color, pg.icon, pg.order_index AS "orderIndex",
            COUNT(p.id)::int AS "problemCount"
     FROM problem_groups pg
     JOIN problem_group_items pgi ON pgi.group_id = pg.id
     JOIN problems p ON p.id = pgi.problem_id
     WHERE pg.is_active = TRUE AND p.is_active = TRUE
     GROUP BY pg.id, pg.slug, pg.name, pg.description, pg.group_type, pg.color, pg.icon, pg.order_index
     ORDER BY pg.order_index ASC, pg.created_at DESC`
  );
  res.json({ groups: rows });
}));

app.get('/api/problem-groups/:slug/problems', requireAuth, asyncRoute(async (req, res) => {
  const { slug } = req.params;
  const { ratingMin, ratingMax, status, cursor } = req.query;

  const { rows: groupRows } = await query(
    'SELECT id, slug, name, description, group_type AS "groupType" FROM problem_groups WHERE slug = $1 AND is_active = TRUE',
    [slug]
  );
  if (!groupRows[0]) {
    return res.status(404).json({ error: 'Không tìm thấy nhóm bài tập.' });
  }
  const group = groupRows[0];

  const parsedMinRating = ratingMin !== undefined && ratingMin !== '' ? Number(ratingMin) : null;
  const parsedMaxRating = ratingMax !== undefined && ratingMax !== '' ? Number(ratingMax) : null;

  const queryParams = [req.user.id, req.user.role, group.id];
  const whereConditions = [
    '(p.is_active = TRUE OR $2 = \'ADMIN\')',
    `p.id IN (SELECT problem_id FROM problem_group_items WHERE group_id = $3)`
  ];

  if (status === 'todo') {
    whereConditions.push('COALESCE(upp.submission_count, 0) = 0');
  } else if (status === 'attempted') {
    whereConditions.push("COALESCE(upp.submission_count, 0) > 0 AND upp.completed_at IS NULL AND COALESCE(upp.best_score, 0) < p.passing_score AND COALESCE(upp.best_status, '') != 'ACCEPTED'");
  } else if (status === 'completed' || status === 'done') {
    whereConditions.push("(upp.completed_at IS NOT NULL OR COALESCE(upp.best_score, 0) >= p.passing_score OR upp.best_status = 'ACCEPTED')");
  }

  if (parsedMinRating !== null) {
    queryParams.push(parsedMinRating);
    whereConditions.push(`p.rating >= $${queryParams.length}`);
  }
  if (parsedMaxRating !== null) {
    queryParams.push(parsedMaxRating);
    whereConditions.push(`p.rating <= $${queryParams.length}`);
  }

  const sortField = 'p.published_at';
  const sortOrder = 'DESC';
  const jsFieldName = 'publishedAt';

  if (cursor) {
    try {
      const { val, id } = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
      if (val !== undefined && id) {
        queryParams.push(val);
        const valPlaceholder = `$${queryParams.length}`;
        queryParams.push(id);
        const idPlaceholder = `$${queryParams.length}`;
        whereConditions.push(
          `(${sortField} < (${valPlaceholder}::timestamptz) OR (${sortField} = (${valPlaceholder}::timestamptz) AND p.id < ${idPlaceholder}))`
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
      upp.completed_at AS "completedAt"
    FROM problems p
    LEFT JOIN user_problem_progress upp ON upp.problem_id = p.id AND upp.user_id = $1
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

  const items = rawItems.map((item) => {
    const submissionCount = Number(item.submissionCount || 0);
    const bestScore = Number(item.bestScore || 0);
    const bestStatus = item.bestStatus || null;
    const completedAt = item.completedAt || null;
    const passingScore = Number(item.passingScore || 100);

    const isAttempted = submissionCount > 0;
    const isCompleted = completedAt !== null || bestStatus === 'ACCEPTED' || bestScore >= passingScore;

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
      isAttempted
    };
  });

  if (items.length > 0) {
    const problemIds = items.map(item => item.id);
    const { rows: groupRows } = await query(
      `SELECT pgi.problem_id, pg.id, pg.slug, pg.name, pg.group_type AS "groupType", pg.color, pg.icon
       FROM problem_group_items pgi
       JOIN problem_groups pg ON pg.id = pgi.group_id
       WHERE pgi.problem_id = ANY($1) AND pg.is_active = TRUE`,
      [problemIds]
    );
    for (const item of items) {
      item.groups = groupRows
        .filter(gr => gr.problem_id === item.id)
        .map(gr => ({
          id: gr.id,
          slug: gr.slug,
          name: gr.name,
          groupType: gr.groupType,
          color: gr.color,
          icon: gr.icon
        }));
    }
  } else {
    for (const item of items) {
      item.groups = [];
    }
  }

  let nextCursor = null;
  if (items.length > 0 && hasMore) {
    const lastItem = items[items.length - 1];
    const lastVal = lastItem[jsFieldName];
    nextCursor = Buffer.from(JSON.stringify({ val: lastVal, id: lastItem.id })).toString('base64');
  }

  res.json({
    group,
    items,
    nextCursor,
    hasMore
  });
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
      numberTolerance: attempt.number_tolerance,
      suppressInputPrompts: true,
      includeHiddenReport: true
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
  const studentReports = maskSubmissionReportForStudent(judged.reports);
  res.status(201).json({ submission, reports: studentReports });
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

  let report = normalizeSubmissionReport(submission.report);
  if (req.user.role !== 'ADMIN') {
    report = maskSubmissionReportForStudent(report);
  }

  delete submission.userId;
  res.json({
    submission: {
      ...submission,
      report
    }
  });
}));

app.get('/api/admin/submissions', requireAdmin, asyncRoute(async (req, res) => {
  const {
    q,
    userId,
    studentId,
    problemId,
    problemSlug
  } = req.query;

  const page = parsePositiveInt(req.query.page, 1, 100000);
  const pageSize = parsePositiveInt(req.query.pageSize, 20, 100);
  const offset = (page - 1) * pageSize;
  const status = normalizeSubmissionStatus(req.query.status);
  const minScore = parseScore(req.query.minScore);
  const maxScore = parseScore(req.query.maxScore);
  const sort = normalizeSubmissionSort(req.query.sort);
  const from = normalizeSubmissionDateFilter(req.query.from);
  const to = normalizeSubmissionDateFilter(req.query.to, { endOfDay: true });

  const where = [];
  const params = [];
  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (q && String(q).trim()) {
    const search = `%${String(q).trim()}%`;
    const placeholder = addParam(search);
    where.push(`(
      u.full_name ILIKE ${placeholder}
      OR u.email ILIKE ${placeholder}
      OR p.title ILIKE ${placeholder}
      OR p.slug ILIKE ${placeholder}
    )`);
  }

  const finalUserId = userId || studentId;
  if (finalUserId) {
    where.push(`s.user_id = ${addParam(finalUserId)}`);
  }

  if (problemId) {
    where.push(`s.problem_id = ${addParam(problemId)}`);
  }

  if (problemSlug) {
    where.push(`p.slug = ${addParam(String(problemSlug).trim())}`);
  }

  if (status) {
    where.push(`s.status = ${addParam(status)}`);
  }

  if (minScore !== null) {
    where.push(`s.score >= ${addParam(minScore)}`);
  }

  if (maxScore !== null) {
    where.push(`s.score <= ${addParam(maxScore)}`);
  }

  if (from) {
    where.push(`s.created_at >= ${addParam(from)}`);
  }

  if (to) {
    where.push(`s.created_at <= ${addParam(to)}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = {
    newest: 's.created_at DESC',
    oldest: 's.created_at ASC',
    score_desc: 's.score DESC, s.created_at DESC',
    score_asc: 's.score ASC, s.created_at DESC'
  }[sort];

  const countParams = [...params];
  const listParams = [...params, pageSize, offset];
  const limitPlaceholder = `$${listParams.length - 1}`;
  const offsetPlaceholder = `$${listParams.length}`;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM submissions s
    JOIN users u ON u.id = s.user_id
    JOIN problems p ON p.id = s.problem_id
    ${whereSql}
  `;

  const listSql = `
    SELECT
      s.id,
      s.user_id AS "studentId",
      u.full_name AS "studentName",
      u.email AS "studentEmail",
      s.problem_id AS "problemId",
      p.title AS "problemTitle",
      p.slug AS "problemSlug",
      s.status,
      s.score::int AS score,
      s.passed_count AS "passedCount",
      s.total_count AS "totalCount",
      s.duration_ms AS "durationMs",
      s.created_at AS "createdAt"
    FROM submissions s
    JOIN users u ON u.id = s.user_id
    JOIN problems p ON p.id = s.problem_id
    ${whereSql}
    ORDER BY ${orderSql}
    LIMIT ${limitPlaceholder}
    OFFSET ${offsetPlaceholder}
  `;

  const [{ rows: countRows }, { rows: submissions }] = await Promise.all([
    query(countSql, countParams),
    query(listSql, listParams)
  ]);

  const total = Number(countRows[0]?.total || 0);
  res.json({
    submissions,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    }
  });
}));

app.get('/api/admin/submissions/:id', requireAdmin, asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { rows } = await query(
    `SELECT
       s.id,
       s.user_id AS "studentId",
       u.full_name AS "studentName",
       u.email AS "studentEmail",
       s.problem_id AS "problemId",
       p.title AS "problemTitle",
       p.slug AS "problemSlug",
       p.compare_mode AS "compareMode",
       p.number_tolerance AS "numberTolerance",
       s.attempt_id AS "attemptId",
       s.code,
       s.status,
       s.score::int AS score,
       s.passed_count AS "passedCount",
       s.total_count AS "totalCount",
       s.duration_ms AS "durationMs",
       s.report,
       s.created_at AS "createdAt"
     FROM submissions s
     JOIN users u ON u.id = s.user_id
     JOIN problems p ON p.id = s.problem_id
     WHERE s.id = $1`,
    [id]
  );

  const submission = rows[0];
  if (!submission) {
    return res.status(404).json({ error: 'Không tìm thấy bài nộp.' });
  }

  submission.report = normalizeSubmissionReport(submission.report);
  res.json({
    submission: {
      ...submission,
      firstFailedReport: getFirstFailedReport(submission.report)
    }
  });
}));

app.post('/api/admin/submissions/:id/rejudge-preview', requireAdmin, asyncRoute(async (req, res) => {
  const { id } = req.params;
  const save = String(req.query.save || '').toLowerCase() === 'true';

  const { rows } = await query(
    `SELECT
       s.id,
       s.code,
       s.problem_id AS "problemId",
       p.execution_limit_ms AS "executionLimitMs",
       p.compare_mode AS "compareMode",
       p.number_tolerance AS "numberTolerance"
     FROM submissions s
     JOIN problems p ON p.id = s.problem_id
     WHERE s.id = $1`,
    [id]
  );

  const submission = rows[0];
  if (!submission) {
    return res.status(404).json({ error: 'KhÃ´ng tÃ¬m tháº¥y bÃ i ná»™p.' });
  }

  const { rows: testcaseRows } = await query(
    `SELECT
       input,
       expected_output AS output,
       is_public AS "isPublic",
       weight,
       order_index
     FROM problem_testcases
     WHERE problem_id = $1
     ORDER BY order_index ASC, id ASC`,
    [submission.problemId]
  );

  const judged = await judgeSubmission(
    submission.code,
    testcaseRows,
    submission.executionLimitMs || 1500,
    false,
    {
      compareMode: submission.compareMode || 'token',
      numberTolerance: submission.numberTolerance ?? 1e-6,
      suppressInputPrompts: true,
      includeHiddenReport: true
    }
  );

  if (save) {
    const statuses = judged.reports.map((item) => item.status);
    const nextStatus = judged.score === 100
      ? 'ACCEPTED'
      : statuses.includes('Time Limit Exceeded')
        ? 'TIME_LIMIT'
        : statuses.includes('Output Limit Exceeded')
          ? 'OUTPUT_LIMIT'
          : statuses.includes('Memory Limit Exceeded')
            ? 'MEMORY_LIMIT'
            : statuses.includes('Runtime Error')
              ? 'RUNTIME_ERROR'
              : 'WRONG_ANSWER';

    await query(
      `UPDATE submissions
       SET
         report = $2::jsonb,
         score = $3,
         status = $4,
         passed_count = $5,
         total_count = $6
       WHERE id = $1`,
      [id, JSON.stringify(judged.reports), judged.score, nextStatus, judged.passed, judged.total]
    );
  }

  res.json({
    report: judged.reports,
    score: judged.score,
    passedCount: judged.passed,
    totalCount: judged.total
  });
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
  const [testcasesRes, groupItemsRes] = await Promise.all([
    query('SELECT input, expected_output AS output, explanation, is_public, weight, order_index FROM problem_testcases WHERE problem_id=$1 ORDER BY order_index ASC', [problem.id]),
    query('SELECT group_id FROM problem_group_items WHERE problem_id=$1', [problem.id])
  ]);
  problem.testcases = testcasesRes.rows;
  problem.groupIds = groupItemsRes.rows.map(gi => gi.group_id);
  res.json({ problem });
}));

app.post('/api/admin/problems', requireAdmin, asyncRoute(async (req, res) => {
  const p = normalizeProblem(req.body);
  const errors = validateProblem(p);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const parsedGroupIds = parseUuidList(req.body.groupIds);
  if (p.isActive && parsedGroupIds.length === 0) {
    return res.status(400).json({ error: 'Bài tập hoạt động phải thuộc ít nhất 1 nhóm hoạt động.' });
  }

  try {
    const saved = await transaction(async (client) => {
      if (p.isActive) {
        await assertActiveGroupsExist(client, parsedGroupIds);
      }

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

      if (parsedGroupIds.length > 0) {
        await assignProblemGroups(client, problem.id, parsedGroupIds, req.user.id);
      }
      problem.groupIds = parsedGroupIds;
      return problem;
    });
    res.status(201).json({ problem: saved });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

app.put('/api/admin/problems/:id', requireAdmin, asyncRoute(async (req, res) => {
  const p = normalizeProblem(req.body);
  const errors = validateProblem(p);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const parsedGroupIds = parseUuidList(req.body.groupIds);
  if (p.isActive && parsedGroupIds.length === 0) {
    return res.status(400).json({ error: 'Bài tập hoạt động phải thuộc ít nhất 1 nhóm hoạt động.' });
  }

  try {
    const saved = await transaction(async (client) => {
      if (p.isActive) {
        await assertActiveGroupsExist(client, parsedGroupIds);
      }

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

      if (p.isActive) {
        await assignProblemGroups(client, problem.id, parsedGroupIds, req.user.id);
      } else {
        const { rows: groupsContaining } = await client.query(
          `SELECT group_id FROM problem_group_items WHERE problem_id = $1`,
          [problem.id]
        );
        const groupIds = groupsContaining.map(r => r.group_id);
        for (const gid of groupIds) {
          const { rows: otherProbs } = await client.query(
            `SELECT pgi.problem_id FROM problem_group_items pgi
             JOIN problems p ON p.id = pgi.problem_id
             WHERE pgi.group_id = $1 AND pgi.problem_id != $2 AND p.is_active = TRUE`,
            [gid, problem.id]
          );
          const { rows: groupInfo } = await client.query('SELECT is_active FROM problem_groups WHERE id = $1', [gid]);
          if (groupInfo[0]?.is_active && otherProbs.length === 0) {
            throw new Error(`Không thể ẩn bài tập này vì nó là bài duy nhất trong nhóm hoạt động "${gid}". Hãy thêm bài khác vào nhóm trước.`);
          }
        }
      }

      if (parsedGroupIds.length > 0) {
        await assignProblemGroups(client, problem.id, parsedGroupIds, req.user.id);
      }
      problem.groupIds = parsedGroupIds;
      return problem;
    });

    if (!saved) return res.status(404).json({ error: 'Không tìm thấy bài.' });
    res.json({ problem: saved });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

app.patch('/api/admin/problems/:id/status', requireAdmin, asyncRoute(async (req, res) => {
  const nextActive = req.body?.isActive ?? req.body?.is_active;
  if (nextActive === undefined) {
    return res.status(400).json({ error: 'Thiáº¿u tráº¡ng thÃ¡i má»›i.' });
  }

  const isActive = Boolean(nextActive);

  try {
    const updated = await transaction(async (client) => {
      const { rows: problemRows } = await client.query('SELECT id FROM problems WHERE id = $1', [req.params.id]);
      if (!problemRows[0]) return null;

      if (isActive) {
        const { rows: activeGroups } = await client.query(
          `SELECT pg.id
           FROM problem_group_items pgi
           JOIN problem_groups pg ON pg.id = pgi.group_id AND pg.is_active = TRUE
           WHERE pgi.problem_id = $1
           LIMIT 1`,
          [req.params.id]
        );
        if (!activeGroups[0]) {
          throw new Error('BÃ i táº­p hoáº¡t Ä‘á»™ng pháº£i thuá»™c Ã­t nháº¥t 1 nhÃ³m hoáº¡t Ä‘á»™ng.');
        }
      }

      const { rows } = await client.query(
        'UPDATE problems SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [isActive, req.params.id]
      );
      return rows[0] || null;
    });

    if (!updated) return res.status(404).json({ error: 'KhÃ´ng tÃ¬m tháº¥y bÃ i.' });
    res.json({ problem: updated });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

app.delete('/api/admin/problems/:id', requireAdmin, asyncRoute(async (req, res) => {
  const hardDelete = String(req.query.hard || '').toLowerCase() === 'true';

  try {
    const result = await transaction(async (client) => {
      const { rows: problemRows } = await client.query('SELECT id FROM problems WHERE id = $1', [req.params.id]);
      if (!problemRows[0]) return null;

      if (!hardDelete) {
        const { rows } = await client.query(
          'UPDATE problems SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id',
          [req.params.id]
        );
        return rows[0] || null;
      }

      await client.query(
        'DELETE FROM problem_assignment_targets WHERE assignment_id IN (SELECT id FROM problem_assignments WHERE problem_id = $1)',
        [req.params.id]
      );
      await client.query('DELETE FROM problem_assignments WHERE problem_id = $1', [req.params.id]);
      await client.query('DELETE FROM student_problem_assignments WHERE problem_id = $1', [req.params.id]);
      await client.query('DELETE FROM user_problem_progress WHERE problem_id = $1', [req.params.id]);
      await client.query('DELETE FROM submissions WHERE problem_id = $1', [req.params.id]);
      await client.query('DELETE FROM attempts WHERE problem_id = $1', [req.params.id]);
      await client.query('DELETE FROM problem_group_items WHERE problem_id = $1', [req.params.id]);
      await client.query('DELETE FROM problem_testcases WHERE problem_id = $1', [req.params.id]);
      await client.query('DELETE FROM problems WHERE id = $1', [req.params.id]);
      return problemRows[0];
    });

    if (!result) return res.status(404).json({ error: 'KhÃ´ng tÃ¬m tháº¥y bÃ i.' });
    res.json({ ok: true, mode: hardDelete ? 'hard_delete' : 'soft_delete' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

// admin problem routes
app.delete('/api/admin/problems/:id', requireAdmin, asyncRoute(async (req, res) => {
  const result = await query('UPDATE problems SET is_active=FALSE,updated_at=NOW() WHERE id=$1', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Không tìm thấy bài.' });
  res.json({ ok: true });
}));

app.post('/api/admin/problems/import', requireAdmin, asyncRoute(async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : req.body.problems;
  if (!Array.isArray(items) || !items.length || items.length > 100) return res.status(400).json({ error: 'File cần chứa từ 1 đến 100 bài.' });

  const globalGroupIds = parseUuidList(req.body.groupIds);
  const createMissingGroups = req.body.createMissingGroups === true || req.body.createMissingGroups === 'true';

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

    const pGroupSlugs = Array.isArray(pRaw.groupSlugs) ? pRaw.groupSlugs.filter(Boolean) : [];
    if (globalGroupIds.length === 0 && pGroupSlugs.length === 0) {
      const name = p.title || p.slug || `Bài ${i + 1}`;
      validationErrors.push(`Bài "${name}": Vui lòng chọn ít nhất 1 nhóm bài tập trước khi import để tránh bài tập mồ côi.`);
    }
  }

  if (validationErrors.length) {
    return res.status(400).json({ error: validationErrors.join(' | ') });
  }

  let createdCount = 0;
  let updatedCount = 0;
  const slugsAffected = [];

  try {
    await transaction(async (client) => {
      if (globalGroupIds.length > 0) {
        await assertActiveGroupsExist(client, globalGroupIds);
      }

      const groupSlugToIdMap = {};

      for (let i = 0; i < normalized.length; i++) {
        const p = normalized[i];
        const pRaw = items[i];
        const pGroupSlugs = Array.isArray(pRaw.groupSlugs) ? pRaw.groupSlugs.filter(Boolean) : [];

        const resolvedGroupIds = [...globalGroupIds];

        for (const slug of pGroupSlugs) {
          if (groupSlugToIdMap[slug]) {
            resolvedGroupIds.push(groupSlugToIdMap[slug]);
            continue;
          }

          const { rows: grRows } = await client.query(
            'SELECT id FROM problem_groups WHERE slug = $1 AND is_active = TRUE',
            [slug]
          );

          if (grRows[0]) {
            const gid = grRows[0].id;
            groupSlugToIdMap[slug] = gid;
            resolvedGroupIds.push(gid);
          } else {
            if (createMissingGroups) {
              const { rows: insertedGr } = await client.query(
                `INSERT INTO problem_groups (name, slug, description, group_type, color, icon, is_active, created_by)
                 VALUES ($1, $2, $3, 'CUSTOM', '#6b7280', 'code', TRUE, $4) RETURNING id`,
                [slug, slug, `Nhóm tự động tạo từ import bài tập`, req.user.id]
              );
              const gid = insertedGr[0].id;
              groupSlugToIdMap[slug] = gid;
              resolvedGroupIds.push(gid);
            } else {
              throw new Error(`Nhóm bài tập có slug "${slug}" không tồn tại hoặc đã bị ẩn.`);
            }
          }
        }

        const uniqueGroupIds = [...new Set(resolvedGroupIds)];
        if (uniqueGroupIds.length === 0) {
          throw new Error(`Bài "${p.title}" không thuộc nhóm nào.`);
        }

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

        await assignProblemGroups(client, problemId, uniqueGroupIds, req.user.id);
      }
    });

    res.json({
      imported: normalized.length,
      created: createdCount,
      updated: updatedCount,
      errors: [],
      slugs: slugsAffected
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

app.get('/api/admin/users', requireAdmin, asyncRoute(async (req, res) => {
  const { q, role, status, page, pageSize, sort } = req.query;

  const countQueryParams = [];
  const countConditions = [];
  if (q && q.trim()) {
    countQueryParams.push(`%${q.trim()}%`);
    countConditions.push(`(u.email ILIKE $${countQueryParams.length} OR u.full_name ILIKE $${countQueryParams.length})`);
  }
  if (role && (role === 'ADMIN' || role === 'STUDENT')) {
    countQueryParams.push(role);
    countConditions.push(`u.role = $${countQueryParams.length}`);
  }
  if (status === 'active') {
    countConditions.push(`u.is_active = TRUE`);
  } else if (status === 'inactive') {
    countConditions.push(`u.is_active = FALSE`);
  }
  const whereClause = countConditions.length ? `WHERE ${countConditions.join(' AND ')}` : '';
  const countQuerySql = `SELECT COUNT(*)::int AS total FROM users u ${whereClause}`;
  const { rows: countRows } = await query(countQuerySql, countQueryParams);
  const total = countRows[0].total;

  const queryParams = [...countQueryParams];
  const limit = Math.min(100, Math.max(1, Number(pageSize || 20)));
  const offset = (Math.max(1, Number(page || 1)) - 1) * limit;

  queryParams.push(limit);
  const limitPlaceholder = `$${queryParams.length}`;
  queryParams.push(offset);
  const offsetPlaceholder = `$${queryParams.length}`;

  let orderBy = 'u.created_at DESC';
  if (sort === 'created_at_asc') orderBy = 'u.created_at ASC';
  else if (sort === 'name_asc') orderBy = 'u.full_name ASC, u.created_at DESC';
  else if (sort === 'email_asc') orderBy = 'u.email ASC, u.created_at DESC';
  else if (sort === 'submissions_desc') orderBy = '"submissionsCount" DESC, u.created_at DESC';
  else if (sort === 'score_desc') orderBy = '"totalScore" DESC, u.created_at DESC';

  const querySql = `
    SELECT
      u.id,
      u.email,
      u.full_name AS "fullName",
      u.role,
      u.is_active AS "isActive",
      u.created_at AS "createdAt",
      u.updated_at AS "updatedAt",
      (SELECT COUNT(*)::int FROM submissions s WHERE s.user_id = u.id) AS "submissionsCount",
      (SELECT COUNT(*)::int FROM user_problem_progress upp WHERE upp.user_id = u.id AND upp.completed_at IS NOT NULL) AS "solvedCount",
      (SELECT COALESCE(MAX(upp.best_score), 0)::int FROM user_problem_progress upp WHERE upp.user_id = u.id) AS "bestScore",
      (SELECT COALESCE(SUM(upp.best_score), 0)::int FROM user_problem_progress upp WHERE upp.user_id = u.id) AS "totalScore",
      (SELECT COUNT(*)::int FROM student_problem_assignments spa WHERE spa.user_id = u.id AND spa.status = 'ASSIGNED') AS "activeAssignmentsCount"
    FROM users u
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
  `;
  const { rows: users } = await query(querySql, queryParams);
  
  const totalPages = Math.ceil(total / limit);

  res.json({
    users,
    pagination: {
      page: Math.max(1, Number(page || 1)),
      pageSize: limit,
      total,
      totalPages
    }
  });
}));

app.post('/api/admin/users', requireAdmin, asyncRoute(async (req, res) => {
  const input = normalizeUserInput(req.body);
  const password = req.body.password;
  const errors = validateUserCreate({ ...input, password });
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  try {
    const saved = await transaction(async (client) => {
      const { rows: existing } = await client.query('SELECT id FROM users WHERE email = $1', [input.email]);
      if (existing[0]) {
        const err = new Error('Email đã tồn tại. Vui lòng chọn email khác.');
        err.status = 409;
        throw err;
      }

      const passHash = hashPassword(password);
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, full_name, role, is_active, created_at, updated_at`,
        [input.email, passHash, input.fullName, input.role, input.isActive]
      );
      return rows[0];
    });
    res.status(201).json({ user: safeUserRow(saved) });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
}));

app.get('/api/admin/users/:id', requireAdmin, asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { rows: userRows } = await query(
    'SELECT id, email, full_name, role, is_active, created_at, updated_at FROM users WHERE id = $1',
    [id]
  );
  const u = userRows[0];
  if (!u) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });

  const { rows: statsRows } = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM submissions WHERE user_id = $1) AS "submissionsCount",
      (SELECT COUNT(*)::int FROM user_problem_progress WHERE user_id = $1 AND completed_at IS NOT NULL) AS "solvedCount",
      (SELECT COUNT(*)::int FROM user_problem_progress WHERE user_id = $1 AND submission_count > 0) AS "attemptedProblemsCount",
      (SELECT COUNT(*)::int FROM user_problem_progress WHERE user_id = $1 AND completed_at IS NOT NULL) AS "completedProblemsCount",
      (SELECT COALESCE(MAX(best_score), 0)::int FROM user_problem_progress WHERE user_id = $1) AS "bestScore",
      (SELECT COALESCE(SUM(best_score), 0)::int FROM user_problem_progress WHERE user_id = $1) AS "totalScore",
      (SELECT COUNT(*)::int FROM student_problem_assignments WHERE user_id = $1 AND status = 'ASSIGNED') AS "activeAssignmentsCount"
  `, [id]);
  const stats = statsRows[0];

  const { rows: subRows } = await query(`
    SELECT
      s.id,
      s.problem_id,
      s.score,
      s.status,
      s.duration_ms AS "durationMs",
      s.created_at AS "createdAt",
      p.title AS "problemTitle",
      p.slug AS "problemSlug"
    FROM submissions s
    JOIN problems p ON p.id = s.problem_id
    WHERE s.user_id = $1
    ORDER BY s.created_at DESC
    LIMIT 10
  `, [id]);

  const { rows: assignRows } = await query(`
    SELECT spa.id, spa.problem_id, spa.assigned_at, p.title AS problem_title, p.slug AS problem_slug, p.rating
    FROM student_problem_assignments spa
    JOIN problems p ON p.id = spa.problem_id
    WHERE spa.user_id = $1 AND spa.status = 'ASSIGNED'
    ORDER BY spa.assigned_at DESC
  `, [id]);

  res.json({
    user: {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      role: u.role,
      isActive: u.is_active,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
      stats,
      recentSubmissions: subRows.map(r => ({
        id: r.id,
        problemId: r.problem_id,
        problemTitle: r.problemTitle,
        problemSlug: r.problemSlug,
        score: r.score,
        status: r.status,
        durationMs: r.durationMs,
        createdAt: r.createdAt
      })),
      activeAssignments: assignRows.map(r => ({
        id: r.id,
        problemId: r.problem_id,
        problemTitle: r.problem_title,
        problemSlug: r.problem_slug,
        rating: r.rating,
        assignedAt: r.assigned_at
      }))
    }
  });
}));

app.patch('/api/admin/users/:id/password', requireAdmin, asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || !validatePassword(newPassword)) {
    return res.status(400).json({ error: 'Mật khẩu phải chứa ít nhất 8 ký tự, bao gồm cả chữ và số.' });
  }

  const passHash = hashPassword(newPassword);
  const { rows } = await query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id',
    [passHash, id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  res.json({ ok: true });
}));

app.patch('/api/admin/users/:id/status', requireAdmin, asyncRoute(async (req, res) => {
  const { id } = req.params;
  const isActive = Boolean(req.body.isActive);

  try {
    const updated = await transaction(async (client) => {
      const { rows: current } = await client.query('SELECT role FROM users WHERE id = $1', [id]);
      if (!current[0]) {
        const err = new Error('Không tìm thấy người dùng.');
        err.status = 404;
        throw err;
      }
      await assertCanModifyUserAdmin(client, req.user.id, id, current[0].role, isActive);

      const { rows } = await client.query(
        `UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2
         RETURNING id, email, full_name, role, is_active, created_at, updated_at`,
        [isActive, id]
      );
      return rows[0];
    });
    res.json({ user: safeUserRow(updated) });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
}));

app.patch('/api/admin/users/:id', requireAdmin, asyncRoute(async (req, res) => {
  const { id } = req.params;
  const input = normalizeUserInput(req.body);
  const errors = validateUserUpdate(input);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  try {
    const updated = await transaction(async (client) => {
      const { rows: current } = await client.query('SELECT email, full_name, role, is_active FROM users WHERE id = $1', [id]);
      if (!current[0]) {
        const err = new Error('Không tìm thấy người dùng.');
        err.status = 404;
        throw err;
      }
      
      const email = input.email !== undefined ? input.email : current[0].email;
      const fullName = input.fullName !== undefined ? input.fullName : current[0].full_name;
      const role = input.role !== undefined ? input.role : current[0].role;
      const isActive = input.isActive !== undefined ? input.isActive : current[0].is_active;

      await assertCanModifyUserAdmin(client, req.user.id, id, role, isActive);

      const { rows: existing } = await client.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, id]);
      if (existing[0]) {
        const err = new Error('Email đã tồn tại. Vui lòng chọn email khác.');
        err.status = 409;
        throw err;
      }

      const { rows } = await client.query(
        `UPDATE users
         SET email = $1, full_name = $2, role = $3, is_active = $4, updated_at = NOW()
         WHERE id = $5
         RETURNING id, email, full_name, role, is_active, created_at, updated_at`,
        [email, fullName, role, isActive, id]
      );
      return rows[0];
    });
    res.json({ user: safeUserRow(updated) });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
}));

app.delete('/api/admin/users/:id', requireAdmin, asyncRoute(async (req, res) => {
  const { id } = req.params;
  const hard = req.query.hard === 'true';

  try {
    await transaction(async (client) => {
      const { rows: userRows } = await client.query('SELECT id, role, is_active FROM users WHERE id = $1', [id]);
      if (!userRows[0]) {
        const err = new Error('Không tìm thấy người dùng.');
        err.status = 404;
        throw err;
      }

      await assertCanModifyUserAdmin(client, req.user.id, id, userRows[0].role, false);

      if (hard) {
        const usage = await getUserUsageCounts(client, id);
        if (usage.submissions > 0 || usage.attempts > 0 || usage.progress > 0 || usage.assignments > 0) {
          const err = new Error('Không thể xóa cứng user này vì đã có dữ liệu học tập. Hãy khóa tài khoản thay thế.');
          err.status = 409;
          throw err;
        }
        await client.query('DELETE FROM users WHERE id = $1', [id]);
      } else {
        await client.query('UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [id]);
      }
    });

    res.json({ ok: true, mode: hard ? 'hard_delete' : 'soft_delete' });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
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

app.get('/api/admin/problem-groups', requireAdmin, asyncRoute(async (req, res) => {
  const { rows } = await query(
    `SELECT pg.id, pg.slug, pg.name, pg.description, pg.group_type AS "groupType",
            pg.color, pg.icon, pg.order_index AS "orderIndex", pg.is_active AS "isActive",
            COALESCE(ARRAY_REMOVE(ARRAY_AGG(pgi.problem_id), NULL), '{}') AS "problemIds",
            COUNT(pgi.problem_id)::int AS "problemCount"
     FROM problem_groups pg
     LEFT JOIN problem_group_items pgi ON pgi.group_id = pg.id
     GROUP BY pg.id, pg.slug, pg.name, pg.description, pg.group_type, pg.color, pg.icon, pg.order_index, pg.is_active
     ORDER BY pg.order_index ASC, pg.created_at DESC`
  );
  res.json({ groups: rows });
}));

app.post('/api/admin/problem-groups', requireAdmin, asyncRoute(async (req, res) => {
  const { name, slug, description, groupType, color, icon, orderIndex, problemIds } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Tên nhóm bài tập không được để trống.' });
  }
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Slug không hợp lệ (chỉ gồm chữ thường, số và dấu gạch ngang).' });
  }
  const parsedProblemIds = parseUuidList(problemIds);
  if (parsedProblemIds.length === 0) {
    return res.status(400).json({ error: 'Nhóm bài tập phải có ít nhất 1 bài. Không được tạo group trống.' });
  }

  try {
    const saved = await transaction(async (client) => {
      const { rows: existing } = await client.query('SELECT id FROM problem_groups WHERE slug = $1', [slug]);
      if (existing[0]) {
        throw new Error('Slug đã tồn tại. Vui lòng chọn slug khác.');
      }

      await assertActiveProblemsExist(client, parsedProblemIds);

      const { rows: pgRows } = await client.query(
        `INSERT INTO problem_groups (name, slug, description, group_type, color, icon, order_index, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8) RETURNING *`,
        [
          name.trim(),
          slug.trim(),
          description || '',
          groupType || 'CUSTOM',
          color || '',
          icon || '',
          Number(orderIndex || 0),
          req.user.id
        ]
      );
      const newGroup = pgRows[0];

      await syncGroupProblems(client, newGroup.id, parsedProblemIds, req.user.id);
      newGroup.problemIds = parsedProblemIds;
      return newGroup;
    });

    res.status(201).json({ group: saved });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

app.put('/api/admin/problem-groups/:id', requireAdmin, asyncRoute(async (req, res) => {
  const { name, description, groupType, color, icon, orderIndex, isActive, problemIds } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Tên nhóm bài tập không được để trống.' });
  }
  const parsedProblemIds = parseUuidList(problemIds);
  const activeStatus = isActive !== undefined ? Boolean(isActive) : true;

  if (activeStatus && parsedProblemIds.length === 0) {
    return res.status(400).json({ error: 'Nhóm bài tập phải có ít nhất 1 bài. Không được tạo group trống.' });
  }

  try {
    const updated = await transaction(async (client) => {
      await assertActiveProblemsExist(client, parsedProblemIds);

      const { rows: pgRows } = await client.query(
        `UPDATE problem_groups
         SET name = $1, description = $2, group_type = $3, color = $4, icon = $5, order_index = $6, is_active = $7, updated_at = NOW()
         WHERE id = $8 RETURNING *`,
        [
          name.trim(),
          description || '',
          groupType || 'CUSTOM',
          color || '',
          icon || '',
          Number(orderIndex || 0),
          activeStatus,
          req.params.id
        ]
      );
      const updatedGroup = pgRows[0];
      if (!updatedGroup) {
        throw new Error('Không tìm thấy nhóm bài tập.');
      }

      await syncGroupProblems(client, updatedGroup.id, parsedProblemIds, req.user.id);
      
      if (!activeStatus) {
        await assertProblemsWillNotBeOrphaned(client, parsedProblemIds, updatedGroup.id);
      }

      updatedGroup.problemIds = parsedProblemIds;
      return updatedGroup;
    });

    res.json({ group: updated });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

app.delete('/api/admin/problem-groups/:id', requireAdmin, asyncRoute(async (req, res) => {
  const { moveToGroupId } = req.body || {};
  
  try {
    await transaction(async (client) => {
      const { rows: groupRows } = await client.query('SELECT id, name, is_active FROM problem_groups WHERE id = $1', [req.params.id]);
      if (!groupRows[0]) {
        throw new Error('Không tìm thấy nhóm bài tập.');
      }
      
      const { rows: itemRows } = await client.query('SELECT problem_id FROM problem_group_items WHERE group_id = $1', [req.params.id]);
      const problemIds = itemRows.map(r => r.problem_id);

      if (moveToGroupId) {
        const { rows: targetRows } = await client.query('SELECT id FROM problem_groups WHERE id = $1 AND is_active = TRUE', [moveToGroupId]);
        if (!targetRows[0]) {
          throw new Error('Nhóm bài tập đích không tồn tại hoặc đã bị ẩn.');
        }
        
        for (const pid of problemIds) {
          await client.query(
            `INSERT INTO problem_group_items (group_id, problem_id, added_by)
             VALUES ($1, $2, $3)
             ON CONFLICT (group_id, problem_id) DO NOTHING`,
            [moveToGroupId, pid, req.user.id]
          );
        }
      } else {
        await assertProblemsWillNotBeOrphaned(client, problemIds, req.params.id);
      }

      await client.query(
        `UPDATE problem_groups SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
        [req.params.id]
      );
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

app.put('/api/admin/problems/:id/groups', requireAdmin, asyncRoute(async (req, res) => {
  const { groupIds } = req.body;
  const parsedGroupIds = parseUuidList(groupIds);
  if (parsedGroupIds.length === 0) {
    return res.status(400).json({ error: 'Bài tập phải thuộc ít nhất 1 nhóm hoạt động.' });
  }

  try {
    await transaction(async (client) => {
      const { rows: probRows } = await client.query('SELECT id FROM problems WHERE id = $1 AND is_active = TRUE', [req.params.id]);
      if (!probRows[0]) {
        throw new Error('Không tìm thấy bài tập hoặc bài tập đã bị ẩn.');
      }

      await assertActiveGroupsExist(client, parsedGroupIds);

      await assignProblemGroups(client, req.params.id, parsedGroupIds, req.user.id);
    });

    const { rows } = await query(
      `SELECT pg.id, pg.slug, pg.name, pg.group_type AS "groupType", pg.color, pg.icon
       FROM problem_group_items pgi
       JOIN problem_groups pg ON pg.id = pgi.group_id
       WHERE pgi.problem_id = $1 AND pg.is_active = TRUE`,
      [req.params.id]
    );
    res.json({ groups: rows });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
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
