import { readFile, writeFile } from 'node:fs/promises';

import { assertGeographicSearchExtentCoverage } from '../src/data-access/geographicSearchExtentContract.js';

import {
  buildPublicSnapshotContent,
  checksum,
  FIXTURE_PATH,
  loadFixtureRows,
  loadRemotePublicRows,
  SNAPSHOT_PATH,
  snapshotContent,
  toSnapshot,
} from './public-snapshot-lib.mjs';

const useFixture = process.argv.includes('--fixture');
const raw = useFixture ? await loadFixtureRows(FIXTURE_PATH) : await loadRemotePublicRows();
const content = buildPublicSnapshotContent(raw);
assertGeographicSearchExtentCoverage(
  content,
  useFixture ? 'MAP-028 CI fixture' : 'Supabase published data',
);
assertGeographicSearchExtentCoverage(
  content,
  useFixture ? 'MAP-028 CI fixture' : 'Supabase published data',
);
const nextChecksum = checksum(content);
let generatedAt = new Date().toISOString();

try {
  const current = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'));
  if (current.checksum === nextChecksum && checksum(snapshotContent(current)) === nextChecksum) {
    generatedAt = current.generatedAt;
  }
} catch {
  // A missing or invalid previous snapshot simply gets a fresh generatedAt value.
}

const snapshot = toSnapshot(content, generatedAt);
await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);

console.log(
  `Generated Beta 0.2 public snapshot from ${useFixture ? 'the MAP-028 CI fixture' : 'Supabase published data'}: ${snapshot.checksum}.`,
);
