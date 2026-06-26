import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const targets = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.windsurfrules',
  '.codex',
  '.agents',
  '.cursor',
  '.github'
];

const ignoredDirs = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage'
]);

const cjkRegex = /[\u3400-\u9FFF\uF900-\uFAFF]/;
const found = [];

function scanFile(filePath) {
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  content.split(/\r?\n/).forEach((line, index) => {
    if (cjkRegex.test(line)) {
      found.push(`${path.relative(root, filePath)}:${index + 1}: ${line}`);
    }
  });
}

function scanPath(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return;

  const stat = fs.statSync(fullPath);
  if (stat.isFile()) {
    scanFile(fullPath);
    return;
  }

  if (!stat.isDirectory()) return;

  const base = path.basename(fullPath);
  if (ignoredDirs.has(base)) return;

  for (const entry of fs.readdirSync(fullPath, { withFileTypes: true })) {
    scanPath(path.relative(root, path.join(fullPath, entry.name)));
  }
}

for (const target of targets) {
  scanPath(target);
}

if (found.length > 0) {
  console.error('Found Chinese/CJK text in agent instruction files:');
  console.error(found.join('\n'));
  process.exit(1);
}

console.log('Language policy check passed.');
