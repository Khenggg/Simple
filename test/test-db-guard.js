export function isLocalTestDatabaseUrl(url) {
  const value = String(url || '').toLowerCase();
  return (
    value.includes('localhost') ||
    value.includes('127.0.0.1') ||
    value.includes('host.docker.internal') ||
    value.includes('simpleoj_test')
  );
}

export function assertLocalTestDatabase(context = 'test') {
  const dbUrl = process.env.DATABASE_URL || '';
  if (isLocalTestDatabaseUrl(dbUrl)) return;
  throw new Error(`Refusing to run ${context} against non-local database.`);
}
