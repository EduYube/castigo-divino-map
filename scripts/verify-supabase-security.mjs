import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.sql',
  '.svg',
  '.toml',
  '.ts',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);
const TEXT_FILENAMES = new Set(['.env.example', '.gitignore']);
const DIRECT_SECRET_PATTERNS = [
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{20,}/g],
  ['Supabase management access token', /\bsbp_[A-Za-z0-9]{20,}\b/g],
  [
    'JWT-like credential',
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
  ],
  ['private key', /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/g],
];
const ASSIGNMENT_PATTERNS = [
  [
    'SUPABASE_ACCESS_TOKEN',
    /\bSUPABASE_ACCESS_TOKEN\s*[:=]\s*["']?([^\s"'#]+)/gi,
  ],
  [
    'SUPABASE_DB_PASSWORD',
    /\bSUPABASE_DB_PASSWORD\s*[:=]\s*["']?([^\s"'#]+)/gi,
  ],
  [
    'SUPABASE_SERVICE_ROLE_KEY',
    /\bSUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["']?([^\s"'#]+)/gi,
  ],
];
const DATABASE_URL_PATTERN = /postgres(?:ql)?:\/\/[^:\s/@]+:([^@\s/]+)@[^\s/]+/gi;

function fail(message) {
  throw new Error(`Supabase security verification failed: ${message}`);
}

function listTrackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.error) {
    fail(`Git could not be executed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(`git ls-files exited with status ${result.status ?? 'unknown'}`);
  }

  return result.stdout.split('\0').filter(Boolean);
}

function isTextFile(filePath) {
  return (
    TEXT_EXTENSIONS.has(extname(filePath).toLowerCase()) ||
    TEXT_FILENAMES.has(basename(filePath))
  );
}

function isPlaceholder(value) {
  const normalized = value.trim().replace(/[;,]$/, '');
  const lowercase = normalized.toLowerCase();

  return (
    normalized.startsWith('${') ||
    normalized.startsWith('<') ||
    lowercase.startsWith('env(') ||
    lowercase.includes('redacted') ||
    lowercase.includes('example') ||
    normalized.includes('***')
  );
}

const findings = [];
const trackedFiles = listTrackedFiles();
let scannedFiles = 0;

for (const filePath of trackedFiles) {
  if (!isTextFile(filePath)) {
    continue;
  }

  const content = await readFile(filePath, 'utf8');
  scannedFiles += 1;

  for (const [name, pattern] of DIRECT_SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      findings.push(`${filePath}: ${name}`);
    }
  }

  for (const [name, pattern] of ASSIGNMENT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      if (!isPlaceholder(match[1])) {
        findings.push(`${filePath}: non-placeholder ${name} assignment`);
      }
    }
  }

  DATABASE_URL_PATTERN.lastIndex = 0;
  for (const match of content.matchAll(DATABASE_URL_PATTERN)) {
    if (!isPlaceholder(match[1])) {
      findings.push(`${filePath}: PostgreSQL URL with an embedded password`);
    }
  }
}

if (findings.length > 0) {
  fail(`credential-like content was found:\n- ${findings.join('\n- ')}`);
}

console.log(
  `Verified ${scannedFiles} tracked text files: no Supabase secret keys, management tokens, JWT credentials, privileged assignments or database passwords were found.`,
);
