import { readFile } from 'node:fs/promises';

import { assertGeographicSpanishSearchCoverage } from '../src/data-access/geographicSpanishReviewContract.js';
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
const verifyMigrationFixture = process.argv.includes('--migration-fixture');
const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'));

if (verifyRemote && verifyMigrationFixture) {
  throw new Error('Choose either --remote or --migration-fixture, not both.');
}

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
assertGeographicSpanishSearchCoverage(committedContent, 'the committed public snapshot');

if (verifyRemote) {
  const raw = await loadRemotePublicRows();
  const expectedContent = buildPublicSnapshotContent(raw);
  const expectedChecksum = checksum(expectedContent);
  assertGeographicSpanishSearchCoverage(expectedContent, 'Supabase published data');

  if (expectedChecksum !== committedChecksum) {
    throw new Error(
      `Public snapshot drift: committed ${committedChecksum}, Supabase published data ${expectedChecksum}.`,
    );
  }

  if (JSON.stringify(committedContent) !== JSON.stringify(expectedContent)) {
    throw new Error('Public snapshot order/content differs from Supabase published data.');
  }
}

if (verifyMigrationFixture) {
  const expectedContent = buildPublicSnapshotContent(await loadFixtureRows(FIXTURE_PATH));
  const committedLegacyContent = { ...committedContent, geographicNames: [] };

  if (JSON.stringify(committedLegacyContent) !== JSON.stringify(expectedContent)) {
    throw new Error(
      'Public snapshot legacy projection differs from the historical MAP-028 migration fixture.',
    );
  }
}

const migrationFixture = await loadFixtureRows(FIXTURE_PATH);
const expectedFixtureContent = buildPublicSnapshotContent(migrationFixture);
const contaminatedFixture = structuredClone(migrationFixture);
contaminatedFixture.categories.push({
  id: 'category-draft-synthetic',
  slug: 'draft-synthetic',
  name: 'Draft synthetic',
  description: 'Must never reach the public snapshot.',
  publication_status: 'draft',
});
contaminatedFixture.tags.push({
  id: 'tag-archived-synthetic',
  name: 'Archived synthetic',
  description: 'Must never reach the public snapshot.',
  publication_status: 'archived',
});
contaminatedFixture.entities.push({
  id: 'entity-draft-synthetic',
  slug: 'draft-synthetic',
  entity_type: 'location',
  visibility: 'pin',
  name: 'Draft synthetic',
  name_language: 'en',
  summary: 'Protected draft content',
  description: 'Protected draft content',
  x: 1,
  y: 1,
  category_id: 'category-settlement',
  publication_status: 'draft',
});
contaminatedFixture.entityAliases.push({
  id: 'alias-draft-synthetic',
  entity_id: 'place-demo-harbor',
  language: 'en',
  value: 'Protected alias',
  publication_status: 'draft',
});
contaminatedFixture.entityTags.push({
  id: 'entity-tag-draft-synthetic',
  entity_id: 'place-demo-harbor',
  tag_id: 'coastal',
  publication_status: 'draft',
});
contaminatedFixture.notes.push({
  id: 'note-draft-synthetic',
  slug: 'draft-synthetic',
  entity_id: 'place-demo-harbor',
  title: 'Protected draft note',
  body: 'Must never reach the public snapshot.',
  sort_order: 99,
  publication_status: 'draft',
});
contaminatedFixture.noteTags.push({
  id: 'note-tag-draft-synthetic',
  note_id: 'note-demo-harbor-overview',
  tag_id: 'coastal',
  publication_status: 'draft',
});
contaminatedFixture.publicRequests = [
  {
    sender_name: 'Private sender',
    reason: 'Administrative input must be ignored.',
    moderation_note: 'Protected moderation data',
    request_status: 'pending',
  },
];

const contaminatedContent = buildPublicSnapshotContent(contaminatedFixture);
if (JSON.stringify(contaminatedContent) !== JSON.stringify(expectedFixtureContent)) {
  throw new Error('Draft, archived or administrative fixture data changed the public projection.');
}

const serialized = JSON.stringify(snapshot);
for (const forbidden of [
  '"publication_status"',
  '"request_status"',
  '"moderation_note"',
  '"sender_name"',
  '"reason"',
  '"public_requests"',
  '"publicRequests"',
]) {
  if (serialized.includes(forbidden)) {
    throw new Error(`Public snapshot leaked a non-public field or domain marker: ${forbidden}.`);
  }
}

const verificationTarget = verifyRemote
  ? 'Supabase published data plus the MAP-039 + MAP-040 geographic coverage gates'
  : verifyMigrationFixture
    ? 'the historical MAP-028 migration fixture plus the MAP-039 + MAP-040 geographic coverage gates'
    : 'its canonical public content, publication filters and MAP-039 + MAP-040 geographic coverage gates';
console.log(
  `Verified Beta 0.2 public snapshot against ${verificationTarget}: ${committedChecksum}.`,
);
