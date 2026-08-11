import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

const DIST_DIRECTORY = 'dist';
const PUBLIC_SNAPSHOT_PATH = 'data/public-catalog.snapshot.json';
const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.map', '.svg', '.txt', '.xml']);
const FORBIDDEN_RASTER_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
]);
const SECRET_PATTERNS = [
  /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /AKIA[0-9A-Z]{16}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /\bsbp_[A-Za-z0-9]{20,}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
  /\bservice_role\b/i,
  /SUPABASE_(?:ACCESS_TOKEN|DB_PASSWORD|SERVICE_ROLE_KEY)/,
  /postgres(?:ql)?:\/\/[^:\s/@]+:[^@\s/]+@/i,
];
const LEGACY_EDITORIAL_MARKERS = [
  'Puerto de demostración',
  'Paso de demostración',
  'Este puerto ficticio sirve para comprobar fichas',
  'Este paso ficticio demuestra cómo una nota pública',
];
const MASTER_CONTENT_CANARIES = [
  'MAP044 MASTER CANARY CHARACTER',
  'MAP044 MASTER CANARY LOCATION',
  'MAP044 MASTER CANARY ALIAS',
  'MAP044 MASTER CANARY NOTE',
  'MAP044 MASTER CANARY GEOGRAPHY',
  'MAP044 MASTER CANARY EVENT',
  'MAP044 MASTER UNIT CANARY',
];

function fail(message) {
  throw new Error(`Production build verification failed: ${message}`);
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, canonicalize(entryValue)]),
    );
  }

  return value;
}

function checksum(value) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')}`;
}

function getRepositoryName() {
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  const packageName = process.env.npm_package_name?.trim();
  const repositoryName = repository?.split('/').at(-1) ?? packageName;

  if (!repositoryName || !/^[a-zA-Z0-9._-]+$/.test(repositoryName)) {
    fail('the repository name could not be derived safely');
  }

  return repositoryName;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    } else {
      fail(`unexpected non-file entry in dist: ${entryPath}`);
    }
  }

  return files;
}

function toPublicPath(filePath) {
  return relative(DIST_DIRECTORY, filePath).split(sep).join('/');
}

const repositoryName = getRepositoryName();
const expectedBase = `/${repositoryName}/`;
const indexPath = join(DIST_DIRECTORY, 'index.html');

if (!(await stat(indexPath).catch(() => null))?.isFile()) {
  fail('dist/index.html is missing');
}

const files = await listFiles(DIST_DIRECTORY);
const publicPaths = files.map(toPublicPath);
const javascriptFiles = publicPaths.filter((file) => extname(file) === '.js');
const stylesheetFiles = publicPaths.filter((file) => extname(file) === '.css');

if (javascriptFiles.length === 0) {
  fail('no generated JavaScript asset was found');
}

if (stylesheetFiles.length === 0) {
  fail('no generated CSS asset was found');
}

if (!publicPaths.includes(PUBLIC_SNAPSHOT_PATH)) {
  fail(`the bundled public snapshot is missing: ${PUBLIC_SNAPSHOT_PATH}`);
}

for (const publicPath of publicPaths) {
  const extension = extname(publicPath).toLowerCase();

  if (FORBIDDEN_RASTER_EXTENSIONS.has(extension)) {
    fail(`a raster image was published: ${publicPath}`);
  }

  if (/sword[-_ ]?coast|lowres|medres|highres|tile/i.test(publicPath)) {
    fail(`a map-like file was published: ${publicPath}`);
  }
}

const indexHtml = await readFile(indexPath, 'utf8');
const generatedReferences = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((reference) => reference.includes('/assets/'));

if (generatedReferences.length === 0) {
  fail('index.html does not reference generated assets');
}

for (const reference of generatedReferences) {
  if (!reference.startsWith(`${expectedBase}assets/`)) {
    fail(`generated resource does not use the Pages base path: ${reference}`);
  }

  const relativeAssetPath = reference.slice(expectedBase.length);

  if (!publicPaths.includes(relativeAssetPath)) {
    fail(`generated resource is missing from dist: ${reference}`);
  }
}

const snapshotFilePath = join(DIST_DIRECTORY, PUBLIC_SNAPSHOT_PATH);
let snapshot;

try {
  snapshot = JSON.parse(await readFile(snapshotFilePath, 'utf8'));
} catch {
  fail('the bundled public snapshot does not contain valid JSON');
}

if (snapshot.schemaVersion !== 2) {
  fail('the bundled public snapshot does not use the Beta 0.2 public contract');
}

if (!snapshot.generatedAt || !Number.isFinite(Date.parse(snapshot.generatedAt))) {
  fail('the bundled public snapshot has an invalid generatedAt value');
}

const {
  generatedAt: _generatedAt,
  sourceRevision,
  checksum: snapshotChecksum,
  ...snapshotContent
} = snapshot;
void _generatedAt;
const expectedSnapshotChecksum = checksum(snapshotContent);

if (sourceRevision !== expectedSnapshotChecksum || snapshotChecksum !== expectedSnapshotChecksum) {
  fail('the bundled public snapshot checksum/sourceRevision does not match its content');
}

const snapshotText = JSON.stringify(snapshot);
for (const forbidden of [
  '"publication_status"',
  '"request_status"',
  '"moderation_note"',
  '"sender_name"',
  '"reason"',
  '"public_requests"',
  '"audience"',
]) {
  if (snapshotText.includes(forbidden)) {
    fail(`the public snapshot contains a protected field or domain marker: ${forbidden}`);
  }
}

let javascriptBundle = '';

for (const filePath of files) {
  if (extname(filePath).toLowerCase() === '.js') {
    javascriptBundle += `\n${await readFile(filePath, 'utf8')}`;
  }
}

for (const marker of LEGACY_EDITORIAL_MARKERS) {
  if (javascriptBundle.includes(marker)) {
    fail(`the Beta 0.1 static editorial fixture was bundled into production JavaScript: ${marker}`);
  }
}

let textualBundle = '';

for (const filePath of files) {
  if (!TEXT_EXTENSIONS.has(extname(filePath).toLowerCase())) {
    continue;
  }

  textualBundle += `\n${await readFile(filePath, 'utf8')}`;
}

if (!textualBundle.includes(OFFICIAL_MAP_URL)) {
  fail('the official remote map URL is missing from the production bundle');
}

for (const canary of MASTER_CONTENT_CANARIES) {
  if (textualBundle.includes(canary)) {
    fail(`a MAP-044 master-only canary leaked into the public production artifact: ${canary}`);
  }
}

for (const pattern of SECRET_PATTERNS) {
  if (pattern.test(textualBundle)) {
    fail(`a known credential pattern matched ${pattern}`);
  }
}

console.log(
  `Verified ${publicPaths.length} production files for ${expectedBase}: index, JavaScript, CSS, Beta 0.2 public snapshot, remote map reference, no master-only canaries, no raster map copy and no known or privileged Supabase credential patterns.`,
);
