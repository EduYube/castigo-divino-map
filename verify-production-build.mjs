import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

const DIST_DIRECTORY = 'dist';
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
];

function fail(message) {
  throw new Error(`Production build verification failed: ${message}`);
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

for (const pattern of SECRET_PATTERNS) {
  if (pattern.test(textualBundle)) {
    fail(`a known credential pattern matched ${pattern}`);
  }
}

console.log(
  `Verified ${publicPaths.length} production files for ${expectedBase}: index, JavaScript, CSS, remote map reference, no raster map copy and no known credential patterns.`,
);
