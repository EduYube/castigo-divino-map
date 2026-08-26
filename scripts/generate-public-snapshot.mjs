import { readFile, writeFile } from 'node:fs/promises';

import { assertGeographicSearchExtentCoverage } from '../src/data-access/geographicSearchExtentContract.js';

import {
  buildPublicMulticampaignSnapshotContent,
  buildPublicSnapshotContent,
  checksum,
  FIXTURE_PATH,
  loadFixtureRows,
  loadRemotePublicMulticampaignRows,
  SNAPSHOT_PATH,
  snapshotContent,
  toSnapshot,
  upgradeLegacySnapshotContentV2,
} from './public-snapshot-lib.mjs';

const useFixture = process.argv.includes('--fixture');
const content = useFixture
  ? upgradeLegacySnapshotContentV2(buildPublicSnapshotContent(await loadFixtureRows(FIXTURE_PATH)))
  : buildPublicMulticampaignSnapshotContent(await loadRemotePublicMulticampaignRows());

assertGeographicSearchExtentCoverage(
  content,
  useFixture ? 'the MAP-028 CI fixture upgraded to MAP-053' : 'Supabase multicampaign data',
);

const nextChecksum = checksum(content);
let generatedAt = new Date().toISOString();

try {
  const current = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'));
  const currentNativeContent = snapshotContent(current);
  const currentNativeChecksum = checksum(currentNativeContent);
  const currentComparableContent =
    current.schemaVersion === 2
      ? upgradeLegacySnapshotContentV2(currentNativeContent)
      : currentNativeContent;

  if (
    current.checksum === currentNativeChecksum &&
    current.sourceRevision === currentNativeChecksum &&
    checksum(currentComparableContent) === nextChecksum
  ) {
    generatedAt = current.generatedAt;
  }
} catch {
  // A missing, invalid or non-equivalent previous snapshot gets a fresh generatedAt value.
}

const snapshot = toSnapshot(content, generatedAt);
await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);

console.log(
  `Generated MAP-053 schema v3 public snapshot from ${
    useFixture ? 'the historical MAP-028 fixture' : 'all active Supabase campaigns'
  }: ${snapshot.checksum}.`,
);
