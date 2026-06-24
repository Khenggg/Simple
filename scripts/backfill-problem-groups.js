import 'dotenv/config';
import { pool, transaction } from '../src/db.js';

const apply = process.argv.includes('--apply');
const dryRun = !apply;

if (dryRun) {
  console.log('=== DRY-RUN MODE (No database changes will be made) ===\n');
} else {
  console.log('=== APPLY MODE (Database changes will be written) ===\n');
}

const defaultGroups = [
  {
    slug: "bai-tap-co-ban",
    name: "Bài tập cơ bản",
    group_type: "BASIC",
    description: "Các bài tập căn bản cho lập trình viên mới bắt đầu",
    color: "#2563eb",
    icon: "code"
  },
  {
    slug: "bai-on-luyen",
    name: "Bài ôn luyện",
    group_type: "PRACTICE",
    description: "Các bài tập thực hành nâng cao kỹ năng tư duy",
    color: "#10b981",
    icon: "practice"
  },
  {
    slug: "bai-nang-cao",
    name: "Bài nâng cao",
    group_type: "ADVANCED",
    description: "Thách thức với các thuật toán và cấu trúc dữ liệu phức tạp",
    color: "#d946ef",
    icon: "star"
  },
  {
    slug: "bai-thi-hsg",
    name: "Bài thi HSG",
    group_type: "HSG",
    description: "Tuyển tập các bài thi học sinh giỏi các cấp",
    color: "#f59e0b",
    icon: "award"
  }
];

async function run() {
  try {
    const adminRes = await pool.query("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1");
    const adminId = adminRes.rows[0]?.id || null;

    // Load active problems
    const problemsRes = await pool.query('SELECT id, slug, title, rating, source FROM problems WHERE is_active = TRUE');
    const problems = problemsRes.rows;

    console.log(`Found ${problems.length} active problems in database.`);

    // Classify problems
    const assignments = [];
    const activeGroupSlugs = new Set();

    for (const p of problems) {
      let groupSlug = 'bai-tap-co-ban'; // fallback
      
      const titleLower = (p.title || '').toLowerCase();
      const sourceLower = (p.source || '').toLowerCase();
      const rating = p.rating ?? 800;

      if (titleLower.includes('hsg') || sourceLower.includes('hsg')) {
        groupSlug = 'bai-thi-hsg';
      } else if (rating >= 1400) {
        groupSlug = 'bai-nang-cao';
      } else if (rating >= 900 && rating <= 1300) {
        groupSlug = 'bai-on-luyen';
      } else if (rating < 900) {
        groupSlug = 'bai-tap-co-ban';
      }

      assignments.push({ problemId: p.id, problemTitle: p.title, groupSlug });
      activeGroupSlugs.add(groupSlug);
    }

    // Determine which groups need to be created (only groups that have at least one assigned problem)
    const groupsToCreate = defaultGroups.filter(g => activeGroupSlugs.has(g.slug));

    await transaction(async (client) => {
      // 1. Create groups
      const groupSlugToId = {};
      for (const g of groupsToCreate) {
        // Check if group already exists
        const existingRes = await client.query('SELECT id FROM problem_groups WHERE slug = $1', [g.slug]);
        let groupId;
        if (existingRes.rows.length > 0) {
          groupId = existingRes.rows[0].id;
          console.log(`Group already exists: "${g.name}" (ID: ${groupId})`);
        } else {
          if (!dryRun) {
            const insertRes = await client.query(
              `INSERT INTO problem_groups (slug, name, description, group_type, color, icon, order_index, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING id`,
              [g.slug, g.name, g.description, g.group_type, g.color, g.icon, 0, adminId]
            );
            groupId = insertRes.rows[0].id;
            console.log(`Created group: "${g.name}" (ID: ${groupId})`);
          } else {
            groupId = 'mock-id-' + g.slug;
            console.log(`[Dry-Run] Would create group: "${g.name}"`);
          }
        }
        groupSlugToId[g.slug] = groupId;
      }

      // 2. Link problems to groups
      let linkCount = 0;
      for (const assign of assignments) {
        const groupId = groupSlugToId[assign.groupSlug];
        if (!groupId) continue;

        // Check if link already exists
        let exists = false;
        if (groupId && !groupId.startsWith('mock-')) {
          const checkRes = await client.query(
            'SELECT 1 FROM problem_group_items WHERE group_id = $1 AND problem_id = $2',
            [groupId, assign.problemId]
          );
          exists = checkRes.rows.length > 0;
        }

        if (exists) {
          console.log(`Problem "${assign.problemTitle}" already in group "${assign.groupSlug}"`);
        } else {
          linkCount++;
          if (!dryRun) {
            await client.query(
              `INSERT INTO problem_group_items (group_id, problem_id, added_by, order_index)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT DO NOTHING`,
              [groupId, assign.problemId, adminId, 0]
            );
            console.log(`Assigned "${assign.problemTitle}" -> "${assign.groupSlug}"`);
          } else {
            console.log(`[Dry-Run] Would assign "${assign.problemTitle}" -> "${assign.groupSlug}"`);
          }
        }
      }

      console.log(`\nSummary:`);
      console.log(`- Groups to create: ${groupsToCreate.length}`);
      console.log(`- Problem items to link: ${linkCount}`);

      if (dryRun) {
        throw new Error('ROLLBACK_DRY_RUN');
      }
    });

    if (dryRun) {
      console.log('\n[Dry-Run] Rollback completed successfully.');
    } else {
      console.log('\n[Apply] Changes committed to database.');
    }
  } catch (error) {
    if (error.message === 'ROLLBACK_DRY_RUN') {
      // expected for dry run
    } else {
      console.error('Error during backfill:', error);
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

run();
