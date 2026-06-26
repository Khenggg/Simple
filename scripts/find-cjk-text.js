import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const ignoredDirs = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage'
]);

const cjkRegex = /[\u3400-\u9FFF\uF900-\uFAFF]/;
const ignoredExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp4',
  '.mp3',
  '.wav'
]);

function looksBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  for (const byte of sample) {
    if (byte === 0) return true;
  }
  return false;
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(root, fullPath);

    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      walk(fullPath);
      continue;
    }

    if (ignoredExtensions.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    let buffer;
    try {
      buffer = fs.readFileSync(fullPath);
    } catch {
      continue;
    }

    if (looksBinary(buffer)) {
      continue;
    }

    const content = buffer.toString('utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (cjkRegex.test(line)) {
        console.log(`${relPath}:${index + 1}: ${line}`);
      }
    });
  }
}

walk(root);
