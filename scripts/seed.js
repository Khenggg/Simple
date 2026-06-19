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
