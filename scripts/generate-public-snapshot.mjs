import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const SOURCE_PATH = 'src/data/catalog.json';
const SNAPSHOT_PATH = 'public/data/public-catalog.snapshot.json';

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
const sourceRevision = checksum(catalog);
let generatedAt = new Date().toISOString();

try {
  const currentSnapshot = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'));

  if (currentSnapshot.sourceRevision === sourceRevision && typeof currentSnapshot.generatedAt === 'string') {
    generatedAt = currentSnapshot.generatedAt;
  }
} catch {
  // The first generation intentionally uses the current UTC time.
}

const content = {
  schemaVersion: 1,
  contract: 'beta01',
  generatedAt,
  sourceRevision,
  catalog,
};
const snapshot = { ...content, checksum: checksum(content) };

await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });
await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(`Generated ${SNAPSHOT_PATH} from ${SOURCE_PATH} (${sourceRevision}).`);
