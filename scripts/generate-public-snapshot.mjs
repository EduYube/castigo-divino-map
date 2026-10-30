import { readFile, writeFile } from 'node:fs/promises';

import { assertGeographicSearchExtentCoverage } from '../src/data-access/geographicSearchExtentContract.js';

import {
  buildPublicMultimapSnapshotContent,
  buildPublicSnapshotContent,
  checksum,
  FIXTURE_PATH,
  loadFixtureRows,
  loadRemotePublicMultimapRows,
  SNAPSHOT_PATH,
  snapshotContent,
  toSnapshot,
  upgradeLegacySnapshotContentV2,
} from './public-snapshot-lib.mjs';

const useFixture = process.argv.includes('--fixture');
const content = useFixture
  ? await (async () => {
      const historical = upgradeLegacySnapshotContentV2(
        buildPublicSnapshotContent(await loadFixtureRows(FIXTURE_PATH)),
      );
      const { schemaVersion: _oldVersion, ...world } = historical;
      void _oldVersion;
      return {
        schemaVersion: 4,
        ...world,
        mapContexts: [],
        campaignLocalMaps: world.campaigns.map((campaign) => ({
          campaignId: campaign.id,
          contexts: [],
          geographicMapContextLinks: [],
          placements: [],
          localOnlyEntities: [],
          notes: [],
          dispositions: [],
          associations: [],
          entityRelations: [],
          characterLocationRelations: [],
        })),
      };
    })()
  : buildPublicMultimapSnapshotContent(await loadRemotePublicMultimapRows());

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
  const currentComparableContent = currentNativeContent;

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
  `Generated MAP-080 schema v4 public snapshot from ${
    useFixture ? 'the historical MAP-028 fixture' : 'all active Supabase campaigns'
  }: ${snapshot.checksum}.`,
);
