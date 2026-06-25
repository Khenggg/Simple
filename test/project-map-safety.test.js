import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('project map does not include secrets or backups', () => {
  const mapPath = path.join(process.cwd(), 'docs', 'project-map.md');
  if (!fs.existsSync(mapPath)) {
    return;
  }
  const content = fs.readFileSync(mapPath, 'utf8');

  assert.equal(content.includes('supabase' + '.com'), false, 'Should not contain production Supabase database credentials');
  assert.equal(content.includes('12345678-12345678-' + '12345678-12345678'), false, 'Should not contain production JWT secrets');
  assert.equal(content.includes('admin' + '@gmail.com'), false, 'Should not contain production admin credentials');
  assert.equal(content.includes('https://api.render' + '.com/deploy/'), false, 'Should not contain Render deploy webhook URLs');
  assert.equal(content.includes('### File: ' + '`.env`'), false, 'Should not map .env files');
  assert.equal(content.includes('### File: ' + '`backups/'), false, 'Should not map backups folder');
});
