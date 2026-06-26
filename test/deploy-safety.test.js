import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

test('Production startup does not run tests or import scripts', async () => {
  const [dockerfile, pkg, renderYaml] = await Promise.all([
    fs.readFile(path.join(root, 'Dockerfile'), 'utf8'),
    fs.readFile(path.join(root, 'package.json'), 'utf8'),
    fs.readFile(path.join(root, 'render.yaml'), 'utf8')
  ]);

  assert.doesNotMatch(dockerfile, /npm\s+test/i);
  assert.doesNotMatch(dockerfile, /scripts\/import-problems-api\.js/i);
  assert.doesNotMatch(dockerfile, /problems:import-api/i);
  assert.doesNotMatch(renderYaml, /test/i);
  assert.doesNotMatch(renderYaml, /import-problems-api/i);

  const pkgJson = JSON.parse(pkg);
  assert.equal(pkgJson.scripts.start, 'node src/server.js');
  assert.equal(pkgJson.scripts.test.includes('import'), false);
});
