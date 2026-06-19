import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { pool } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import { normalizeProblem } from '../src/validation.js';

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

const count = await pool.query('SELECT COUNT(*)::int AS count FROM problems');
if (count.rows[0].count === 0) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const source = JSON.parse(await fs.readFile(path.join(root, 'problems.json'), 'utf8'));
  const admin = await pool.query("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1");
  for (const raw of source) {
    const p = normalizeProblem({ ...raw, slug: raw.id, timeLimitMinutes: 30, executionLimitMs: 1500 });
    await pool.query(
      `INSERT INTO problems(slug, title, difficulty, rating, description, starter_code, examples, testcases,
        time_limit_minutes, execution_limit_ms, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11) ON CONFLICT(slug) DO NOTHING`,
      [p.slug, p.title, p.difficulty, p.rating, p.description, p.starterCode, JSON.stringify(p.examples),
        JSON.stringify(p.testcases), p.timeLimitMinutes, p.executionLimitMs, admin.rows[0]?.id || null]
    );
  }
  console.log(`Seeded ${source.length} problems.`);
}
await pool.end();
