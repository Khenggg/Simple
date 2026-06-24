import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { pool, transaction } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import { normalizeProblem } from '../src/validation.js';
import { canonicalProblems } from '../data/canonical-problems.js';

const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';
const name = process.env.ADMIN_NAME || 'Quản trị viên';

// Seed Admin
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

// Title normalization helper
function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/bài\s+\d+:/gi, '')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function insertCanonicalProblems(createdBy) {
  // Load existing problems for title comparisons
  const existingRes = await pool.query('SELECT id, slug, title, source FROM problems');
  const existingProblems = existingRes.rows;

  let insertedCount = 0;
  let skippedCount = 0;

  await transaction(async (client) => {
    for (const raw of canonicalProblems) {
      const p = normalizeProblem({
        ...raw,
        timeLimitMinutes: raw.timeLimitMinutes ?? 30,
        executionLimitMs: raw.executionLimitMs ?? 1500
      });

      // 1. Check same slug
      const hasSameSlug = existingProblems.some(ep => ep.slug === p.slug);
      if (hasSameSlug) {
        console.log(`ℹ️ Bỏ qua bài seed (Slug đã tồn tại): ${p.slug}`);
        skippedCount++;
        continue;
      }

      // 2. Check same source
      if (p.source) {
        const hasSameSource = existingProblems.some(ep => ep.source === p.source);
        if (hasSameSource) {
          console.log(`ℹ️ Bỏ qua bài seed (Nguồn trùng lặp): ${p.slug} (Source: ${p.source})`);
          skippedCount++;
          continue;
        }
      }

      // 3. Check same normalized title
      const normPTitle = normalizeTitle(p.title);
      const hasSameTitle = existingProblems.some(ep => normalizeTitle(ep.title) === normPTitle);
      if (hasSameTitle) {
        console.log(`ℹ️ Bỏ qua bài seed (Tiêu đề trùng lặp): ${p.slug} (Title: ${p.title})`);
        skippedCount++;
        continue;
      }

      // Insert new problem
      const { rows } = await client.query(
        `INSERT INTO problems(slug,title,difficulty,rating,max_score,passing_score,published_at,source,order_index,description,starter_code,examples,time_limit_minutes,execution_limit_ms,is_active,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16)
         RETURNING id`,
        [
          p.slug, p.title, p.difficulty, p.rating, p.maxScore, p.passingScore, p.publishedAt, p.source, p.orderIndex,
          p.description, p.starterCode, JSON.stringify(p.examples), p.timeLimitMinutes, p.executionLimitMs, p.isActive, createdBy
        ]
      );
      
      const problemId = rows[0]?.id;
      if (problemId) {
        insertedCount++;
        // Insert its testcases
        for (const tc of p.testcases) {
          await client.query(
            `INSERT INTO problem_testcases(problem_id, input, expected_output, explanation, is_public, weight, order_index)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [problemId, tc.input, tc.output, tc.explanation, tc.isPublic, tc.weight, tc.orderIndex]
          );
        }
        
        // Add to existingProblems in memory for subsequent checks in this loop
        existingProblems.push({
          id: problemId,
          slug: p.slug,
          title: p.title,
          source: p.source
        });
      }
    }
  });

  console.log(`Seeding complete: Seeded ${insertedCount} new problems. Skipped ${skippedCount} duplicate/existing problems.`);
}

const admin = await pool.query("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1");
await insertCanonicalProblems(admin.rows[0]?.id || null);

await pool.end();
