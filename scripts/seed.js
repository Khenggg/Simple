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
    // Ensure default groups exist
    const defaultGroups = [
      { slug: 'bai-tap-co-ban', name: 'Bài tập cơ bản', type: 'BASIC', description: 'Các bài tập căn bản cho lập trình viên mới bắt đầu' },
      { slug: 'bai-on-luyen', name: 'Bài ôn luyện', type: 'PRACTICE', description: 'Các bài tập thực hành nâng cao kỹ năng tư duy' }
    ];
    const groupSlugToId = {};
    for (const g of defaultGroups) {
      const existing = await client.query('SELECT id FROM problem_groups WHERE slug = $1', [g.slug]);
      if (existing.rows[0]) {
        groupSlugToId[g.slug] = existing.rows[0].id;
      } else {
        const insertRes = await client.query(
          `INSERT INTO problem_groups (slug, name, description, group_type, color, icon)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [g.slug, g.name, g.description, g.type, g.type === 'BASIC' ? '#2563eb' : '#10b981', g.type === 'BASIC' ? 'code' : 'practice']
        );
        groupSlugToId[g.slug] = insertRes.rows[0].id;
      }
    }

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

        // Assign to group
        const targetGroupSlug = p.rating >= 900 ? 'bai-on-luyen' : 'bai-tap-co-ban';
        const groupId = groupSlugToId[targetGroupSlug];
        await client.query(
          `INSERT INTO problem_group_items(group_id, problem_id, added_by)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [groupId, problemId, createdBy]
        );
        
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
