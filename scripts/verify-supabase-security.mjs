import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DIRECT_SECRET_PATTERNS = [
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{20,}/g],
  ['Supabase management access token', /\bsbp_[A-Za-z0-9]{20,}\b/g],
  ['JWT-like credential', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g],
  ['private key', /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/g],
];
const ASSIGNMENT_PATTERNS = [
  ['SUPABASE_ACCESS_TOKEN', /\bSUPABASE_ACCESS_TOKEN\s*[:=]\s*["']?([^\s"'#]+)/gi],
  ['SUPABASE_DB_PASSWORD', /\bSUPABASE_DB_PASSWORD\s*[:=]\s*["']?([^\s"'#]+)/gi],
  ['SUPABASE_SERVICE_ROLE_KEY', /\bSUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["']?([^\s"'#]+)/gi],
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

export function isBinaryContent(content) {
  return content.includes(0);
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

export function scanTrackedContent(filePath, content) {
  if (isBinaryContent(content)) {
    return { findings: [], skippedBinary: true };
  }

  const text = content.toString('utf8');
  const findings = [];

  for (const [name, pattern] of DIRECT_SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      findings.push(`${filePath}: ${name}`);
    }
  }

  for (const [name, pattern] of ASSIGNMENT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (!isPlaceholder(match[1])) {
        findings.push(`${filePath}: non-placeholder ${name} assignment`);
      }
    }
  }

  DATABASE_URL_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(DATABASE_URL_PATTERN)) {
    if (!isPlaceholder(match[1])) {
      findings.push(`${filePath}: PostgreSQL URL with an embedded password`);
    }
  }

  return { findings, skippedBinary: false };
}

export async function verifyTrackedFiles() {
  const findings = [];
  const trackedFiles = listTrackedFiles();
  let scannedFiles = 0;
  let skippedBinaryFiles = 0;

  for (const filePath of trackedFiles) {
    const content = await readFile(filePath);
    const result = scanTrackedContent(filePath, content);

    if (result.skippedBinary) {
      skippedBinaryFiles += 1;
      continue;
    }

    scannedFiles += 1;
    findings.push(...result.findings);
  }

  if (findings.length > 0) {
    fail(`credential-like content was found:\n- ${findings.join('\n- ')}`);
  }

  console.log(
    `Verified ${scannedFiles} tracked non-binary files and skipped ${skippedBinaryFiles} binary files: no Supabase secret keys, management tokens, JWT credentials, private keys, privileged assignments or database passwords were found.`,
  );
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  await verifyTrackedFiles();
}
