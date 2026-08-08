import { readFile } from 'node:fs/promises';

import {
  buildPublicSnapshotContent,
  checksum,
  FIXTURE_PATH,
  loadFixtureRows,
  loadRemotePublicRows,
  SNAPSHOT_PATH,
  snapshotContent,
} from './public-snapshot-lib.mjs';

const verifyRemote = process.argv.includes('--remote');
const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'));

if (snapshot.schemaVersion !== 2) {
  throw new Error('The committed public snapshot must use schemaVersion 2.');
}
if (!Number.isFinite(Date.parse(snapshot.generatedAt))) {
  throw new Error('The committed public snapshot has an invalid generatedAt value.');
}

const committedContent = snapshotContent(snapshot);
const committedChecksum = checksum(committedContent);
if (snapshot.checksum !== committedChecksum || snapshot.sourceRevision !== committedChecksum) {
  throw new Error('The committed public snapshot checksum/sourceRevision is invalid.');
}

const raw = verifyRemote ? await loadRemotePublicRows() : await loadFixtureRows(FIXTURE_PATH);
const expectedContent = buildPublicSnapshotContent(raw);
const expectedChecksum = checksum(expectedContent);

if (expectedChecksum !== committedChecksum) {
  throw new Error(
    `Public snapshot drift: committed ${committedChecksum}, ${verifyRemote ? 'Supabase' : 'fixture'} ${expectedChecksum}.`,
  );
}

if (JSON.stringify(committedContent) !== JSON.stringify(expectedContent)) {
  throw new Error(
    `Public snapshot order/content differs from the ${verifyRemote ? 'Supabase' : 'fixture'} projection.`,
  );
}

const serialized = JSON.stringify(snapshot);
for (const forbidden of [
  '"publication_status"',
  '"request_status"',
  '"moderation_note"',
  '"sender_name"',
  '"reason"',
  '"public_requests"',
]) {
  if (serialized.includes(forbidden)) {
    throw new Error(`Public snapshot leaked a non-public field or domain marker: ${forbidden}.`);
  }
}

console.log(
  `Verified Beta 0.2 public snapshot against ${verifyRemote ? 'Supabase published data' : 'the MAP-028 CI fixture'}: ${committedChecksum}.`,
);
