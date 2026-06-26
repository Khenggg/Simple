import 'dotenv/config';
import { pool, transaction } from '../src/db.js';

const DEFAULT_PREFIXES = [
  'temp-',
  'test-',
  'dummy-',
  'admin-sub-',
  'test-group-',
  'test-crud-',
  'student-review-',
  'other-student-review-',
  'masked-'
];

function isLocalDatabaseUrl(url) {
  const value = String(url || '').toLowerCase();
  return (
    value.includes('localhost') ||
    value.includes('127.0.0.1') ||
    value.includes('host.docker.internal') ||
    value.includes('simpleoj_test')
  );
}

function parsePrefixes(argv) {
  const prefixes = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--prefix') continue;
    const value = String(argv[index + 1] || '').trim();
    if (value) prefixes.push(value);
    index += 1;
  }
  return prefixes.length ? prefixes : DEFAULT_PREFIXES;
}

function assertSafeToApply(isApply) {
  if (!isApply) return;
  const dbUrl = process.env.DATABASE_URL || '';
  const allowRealReset = process.env.ALLOW_REAL_DB_RESET === 'true';
  const confirmed = process.env.CONFIRM_CLEANUP_TEST_PROBLEMS === 'YES';

  if (isLocalDatabaseUrl(dbUrl)) return;
  if (allowRealReset && confirmed) {
    console.warn('Warning: running test-problem cleanup against a non-local DB because explicit override flags are set.');
    return;
  }

  throw new Error(
    'Refusing to run --apply against a non-local database. ' +
    'Use a local/test database, or set ALLOW_REAL_DB_RESET=true and CONFIRM_CLEANUP_TEST_PROBLEMS=YES intentionally.'
  );
}

async function fetchCandidates(client, patterns) {
  const { rows } = await client.query(
    `SELECT
       p.id,
       p.slug,
       p.title,
       p.is_active AS "isActive",
       COUNT(DISTINCT s.id)::int AS submissions_count,
       COUNT(DISTINCT a.id)::int AS attempts_count,
       COUNT(DISTINCT spa.id)::int AS assignments_count,
       COUNT(DISTINCT upp.user_id::text || ':' || upp.problem_id::text)::int AS progress_count,
       COUNT(DISTINCT pgi.group_id)::int AS group_links_count,
       COUNT(DISTINCT pa.id)::int AS problem_assignments_count,
       COUNT(DISTINCT pat.id)::int AS assignment_target_count
     FROM problems p
     LEFT JOIN submissions s ON s.problem_id = p.id
     LEFT JOIN attempts a ON a.problem_id = p.id
     LEFT JOIN student_problem_assignments spa ON spa.problem_id = p.id
     LEFT JOIN user_problem_progress upp ON upp.problem_id = p.id
     LEFT JOIN problem_group_items pgi ON pgi.problem_id = p.id
     LEFT JOIN problem_assignments pa ON pa.problem_id = p.id
     LEFT JOIN problem_assignment_targets pat ON pat.assignment_id = pa.id
     WHERE p.slug LIKE ANY($1::text[])
     GROUP BY p.id, p.slug, p.title, p.is_active
     ORDER BY p.slug ASC`,
    [patterns.map((prefix) => `${prefix}%`)]
  );
  return rows;
}

async function hardDeleteProblems(client, problemIds) {
  if (!problemIds.length) return;
  await client.query(
    'DELETE FROM problem_assignment_targets WHERE assignment_id IN (SELECT id FROM problem_assignments WHERE problem_id = ANY($1::uuid[]))',
    [problemIds]
  );
  await client.query('DELETE FROM problem_assignments WHERE problem_id = ANY($1::uuid[])', [problemIds]);
  await client.query('DELETE FROM student_problem_assignments WHERE problem_id = ANY($1::uuid[])', [problemIds]);
  await client.query('DELETE FROM user_problem_progress WHERE problem_id = ANY($1::uuid[])', [problemIds]);
  await client.query('DELETE FROM submissions WHERE problem_id = ANY($1::uuid[])', [problemIds]);
  await client.query('DELETE FROM attempts WHERE problem_id = ANY($1::uuid[])', [problemIds]);
  await client.query('DELETE FROM problem_group_items WHERE problem_id = ANY($1::uuid[])', [problemIds]);
  await client.query('DELETE FROM problem_testcases WHERE problem_id = ANY($1::uuid[])', [problemIds]);
  await client.query('DELETE FROM problems WHERE id = ANY($1::uuid[])', [problemIds]);
}

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isDryRun = args.includes('--dry-run') || !isApply;
  const prefixes = parsePrefixes(args);

  assertSafeToApply(isApply);

  if (isApply) {
    console.log('Running in APPLY mode.');
  } else {
    console.log('Running in DRY-RUN mode.');
  }
  console.log(`Slug prefixes: ${prefixes.join(', ')}`);

  const candidates = await transaction(async (client) => fetchCandidates(client, prefixes));

  if (!candidates.length) {
    console.log('No matching test problems found.');
    await pool.end();
    return;
  }

  console.log('\nMatched problems:');
  for (const problem of candidates) {
    console.log(`- ${problem.slug} | ${problem.title} | active=${problem.isActive ? 'yes' : 'no'} | submissions=${problem.submissions_count} | attempts=${problem.attempts_count}`);
  }

  if (isDryRun) {
    console.log('\nNo changes were made. Run with --apply to delete the matched problems.');
    await pool.end();
    return;
  }

  await transaction(async (client) => {
    await hardDeleteProblems(client, candidates.map((problem) => problem.id));
  });

  console.log(`Deleted ${candidates.length} problem(s).`);
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exit(1);
});
