import { readdirSync, statSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, relative, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

// Determine repository root relative to this script (assumed to be in scripts/ folder)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

const OUTPUT_FILE = join(REPO_ROOT, 'docs', 'project-map.md');
const IGNORE_FILE = join(REPO_ROOT, '.mapignore');

// Parse .mapignore
let ignoreLines = [];
if (existsSync(IGNORE_FILE)) {
  ignoreLines = readFileSync(IGNORE_FILE, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

const WHITELISTED_FILES = new Set([
  'scripts/migrate.js',
  'scripts/seed.js',
  'scripts/reset-and-seed-basic-problems.js',
  'scripts/backfill-problem-groups.js',
  'scripts/check-problem-group-integrity.js',
  'scripts/cleanup-duplicate-problems.js',
  'scripts/replace-testcases.js',
  'scripts/upsert-bai-20-quadratic.js',
  'scripts/verify-canonical-testcases.js',
  'scripts/generate-project-map.js',
  'scripts/upload-project-map.js',
  'src/python-runner.py',
  'src/terminal-runner.py',
  'public/index.html',
  'public/app.js',
  'public/styles.css',
  'public/terminal-client.js'
]);

function isOrContainsWhitelisted(relPath, isDir) {
  const normPath = relPath.replace(/\\/g, '/');
  for (const wFile of WHITELISTED_FILES) {
    if (wFile === normPath) return true;
    if (isDir && wFile.startsWith(normPath + '/')) return true;
  }
  return false;
}

function shouldIgnore(relPath, isDir) {
  if (isOrContainsWhitelisted(relPath, isDir)) {
    return false;
  }
  const normPath = relPath.replace(/\\/g, '/');
  
  for (const line of ignoreLines) {
    const normLine = line.replace(/\\/g, '/');
    
    if (normLine.endsWith('/')) {
      const dirPattern = normLine.slice(0, -1);
      const segments = normPath.split('/');
      if (segments.includes(dirPattern)) {
        return true;
      }
      if (normPath === dirPattern || normPath.startsWith(dirPattern + '/')) {
        return true;
      }
    } else {
      if (normPath === normLine) {
        return true;
      }
      const base = basename(normPath);
      if (base === normLine) {
        return true;
      }
    }
  }
  return false;
}

const ALLOWED_EXTENSIONS = new Set([
  '.json', '.js', '.jsx', '.ts', '.tsx', '.cs', '.java', '.xml', '.html', '.css', '.sql', '.md', '.dbml', '.mmd', '.yaml', '.yml', '.py'
]);

const ALLOWED_FILENAMES = new Set([
  '.env.example', 'pom.xml', '.gitignore', 'README.md', 'Dockerfile', 'docker-compose.yml', 'render.yaml', 'vercel.json'
]);

const filesToInclude = [];

function buildTree(dir, depth = 0) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (error) {
    return '';
  }

  let result = '';
  const indent = '  '.repeat(depth);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const relPath = relative(REPO_ROOT, fullPath);
    let stats;
    try {
      stats = statSync(fullPath);
    } catch (e) {
      continue;
    }

    if (stats.isDirectory()) {
      if (shouldIgnore(relPath, true)) continue;
      result += `${indent}- 📁 **${entry}/**\n`;
      result += buildTree(fullPath, depth + 1);
    } else {
      if (shouldIgnore(relPath, false)) continue;
      
      const ext = entry.substring(entry.lastIndexOf('.')).toLowerCase();
      const isAllowed = ALLOWED_EXTENSIONS.has(ext) || ALLOWED_FILENAMES.has(entry);
      if (!isAllowed) continue;

      result += `${indent}- 📄 ${entry} (${(stats.size / 1024).toFixed(1)} KB)\n`;
      filesToInclude.push({
        relPath: relPath.replace(/\\/g, '/'),
        fullPath,
        ext,
        entry
      });
    }
  }
  return result;
}

let markdown = `# Project Architecture Map: SimpleOJ\n\n`;
markdown += `This file contains the directory tree and full code contents of the non-ignored files in the SimpleOJ repository.\n\n`;

markdown += `## 1. Directory Tree\n\n\`\`\`markdown\n`;
markdown += buildTree(REPO_ROOT);
markdown += `\`\`\`\n\n`;

markdown += `## 2. File Contents\n\n`;

let fileCount = 0;
for (const file of filesToInclude) {
  if (file.relPath === 'docs/project-map.md') {
    continue;
  }
  
  try {
    const content = readFileSync(file.fullPath, 'utf8');
    
    // Determine language syntax highlighting
    let lang = 'text';
    const ext = file.ext;
    if (ext === '.json') lang = 'json';
    else if (ext === '.js' || ext === '.jsx') lang = 'javascript';
    else if (ext === '.ts' || ext === '.tsx') lang = 'typescript';
    else if (ext === '.cs') lang = 'csharp';
    else if (ext === '.java') lang = 'java';
    else if (ext === '.xml') lang = 'xml';
    else if (ext === '.html') lang = 'html';
    else if (ext === '.css') lang = 'css';
    else if (ext === '.sql') lang = 'sql';
    else if (ext === '.md') lang = 'markdown';
    else if (ext === '.yaml' || ext === '.yml') lang = 'yaml';
    else if (file.entry.startsWith('.env')) lang = 'bash';
    else if (file.entry === 'Dockerfile') lang = 'dockerfile';

    markdown += `### File: \`${file.relPath}\`\n\n`;
    markdown += `\`\`\`${lang}\n`;
    markdown += content;
    if (!content.endsWith('\n')) markdown += '\n';
    markdown += `\`\`\`\n\n`;
    
    fileCount++;
  } catch (e) {
    console.error(`Failed to read ${file.relPath}: ${e.message}`);
  }
}

// Write the output file
const docsDir = join(REPO_ROOT, 'docs');
if (!existsSync(docsDir)) {
  mkdirSync(docsDir, { recursive: true });
}
writeFileSync(OUTPUT_FILE, markdown, 'utf8');

console.log(`Successfully generated project map containing ${fileCount} files at ${OUTPUT_FILE}`);
