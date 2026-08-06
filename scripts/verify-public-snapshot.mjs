import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const SOURCE_PATH = 'src/data/catalog.json';
const SNAPSHOT_PATH = 'public/data/public-catalog.snapshot.json';

function fail(message) {
  throw new Error(`Public snapshot verification failed: ${message}`);
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
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')}`;
}

const catalog = JSON.parse(await readFile(SOURCE_PATH, 'utf8'));
const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'));

if (snapshot.schemaVersion !== 1 || snapshot.contract !== 'beta01') {
  fail('the committed snapshot does not use the Beta 0.1 compatibility contract');
}

if (!snapshot.generatedAt || !Number.isFinite(Date.parse(snapshot.generatedAt))) {
  fail('generatedAt is missing or invalid');
}

const expectedSourceRevision = checksum(catalog);

if (snapshot.sourceRevision !== expectedSourceRevision) {
  fail('sourceRevision does not match src/data/catalog.json; run npm run snapshot:generate');
}

if (JSON.stringify(snapshot.catalog) !== JSON.stringify(catalog)) {
  fail('catalog content does not match src/data/catalog.json; run npm run snapshot:generate');
}

const expectedChecksum = checksum({
  schemaVersion: 1,
  contract: 'beta01',
  generatedAt: snapshot.generatedAt,
  sourceRevision: snapshot.sourceRevision,
  catalog: snapshot.catalog,
});

if (snapshot.checksum !== expectedChecksum) {
  fail('checksum does not match the committed snapshot content');
}

console.log(`Verified ${SNAPSHOT_PATH} (${snapshot.sourceRevision}).`);
