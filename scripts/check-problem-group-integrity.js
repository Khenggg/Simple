import 'dotenv/config';
import { pool } from '../src/db.js';

async function run() {
  let ok = true;
  try {
    // 1. Check for empty active groups
    const emptyGroupsRes = await pool.query(`
      SELECT g.id, g.slug, g.name
      FROM problem_groups g
      LEFT JOIN problem_group_items pgi ON pgi.group_id = g.id
      LEFT JOIN problems p ON p.id = pgi.problem_id AND p.is_active = TRUE
      WHERE g.is_active = TRUE
      GROUP BY g.id, g.slug, g.name
      HAVING COUNT(p.id) = 0
    `);
    
    if (emptyGroupsRes.rows.length > 0) {
      ok = false;
      console.error('❌ Error: Found empty active problem groups:');
      for (const row of emptyGroupsRes.rows) {
        console.error(`   - Name: "${row.name}" | Slug: "${row.slug}" (ID: ${row.id})`);
      }
    } else {
      console.log('✅ Success: No empty active problem groups found.');
    }

    // 2. Check for active problems without active groups
    const orphanProblemsRes = await pool.query(`
      SELECT p.id, p.slug, p.title
      FROM problems p
      LEFT JOIN problem_group_items pgi ON pgi.problem_id = p.id
      LEFT JOIN problem_groups g ON g.id = pgi.group_id AND g.is_active = TRUE
      WHERE p.is_active = TRUE
      GROUP BY p.id, p.slug, p.title
      HAVING COUNT(g.id) = 0
    `);

    if (orphanProblemsRes.rows.length > 0) {
      ok = false;
      console.error('❌ Error: Found active problems with no active group (orphans):');
      for (const row of orphanProblemsRes.rows) {
        console.error(`   - Title: "${row.title}" | Slug: "${row.slug}" (ID: ${row.id})`);
      }
    } else {
      console.log('✅ Success: No active orphan problems found.');
    }

    if (!ok) {
      console.error('\n❌ Integrity checks FAILED.');
      process.exit(1);
    } else {
      console.log('\n✅ Integrity checks PASSED.');
      process.exit(0);
    }
  } catch (error) {
    console.error('Error running integrity checks:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
