import { readFile } from 'node:fs/promises';

import { assertGeographicSearchExtentCoverage } from '../src/data-access/geographicSearchExtentContract.js';
import {
  assertPublicMultimapSnapshotContent,
  buildPublicMulticampaignSnapshotContent,
  buildPublicMultimapSnapshotContent,
  buildPublicSnapshotContent,
  checksum,
  FIXTURE_PATH,
  loadFixtureRows,
  loadRemotePublicMultimapRows,
  projectMulticampaignSnapshotContentToV2,
  SNAPSHOT_PATH,
  snapshotContent,
} from './public-snapshot-lib.mjs';

const verifyRemote = process.argv.includes('--remote');
const verifyMigrationFixture = process.argv.includes('--migration-fixture');
const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'));

if (verifyRemote && verifyMigrationFixture) {
  throw new Error('Choose either --remote or --migration-fixture, not both.');
}
if (snapshot.schemaVersion !== 4) {
  throw new Error('The committed MAP-080 public snapshot MUST use schemaVersion 4.');
}
if (!Number.isFinite(Date.parse(snapshot.generatedAt))) {
  throw new Error('The committed public snapshot has an invalid generatedAt value.');
}

const committedNativeContent = snapshotContent(snapshot);
const committedNativeChecksum = checksum(committedNativeContent);
if (
  snapshot.checksum !== committedNativeChecksum ||
  snapshot.sourceRevision !== committedNativeChecksum
) {
  throw new Error('The committed public snapshot checksum/sourceRevision is invalid.');
}

const committedMulticampaignContent = {
  schemaVersion: 3,
  campaigns: committedNativeContent.campaigns,
  campaignCatalogs: committedNativeContent.campaignCatalogs,
  geographicNames: committedNativeContent.geographicNames,
};
const committedLegacyContent = projectMulticampaignSnapshotContentToV2(
  committedMulticampaignContent,
);
assertPublicMultimapSnapshotContent(committedNativeContent);
assertGeographicSearchExtentCoverage(
  committedNativeContent,
  'the committed MAP-080 V4 public snapshot',
);

if (verifyRemote) {
  const expectedContent = buildPublicMultimapSnapshotContent(await loadRemotePublicMultimapRows());
  const expectedChecksum = checksum(expectedContent);
  if (
    expectedChecksum !== committedNativeChecksum ||
    JSON.stringify(expectedContent) !== JSON.stringify(committedNativeContent)
  ) {
    throw new Error(
      `MAP-080 V4 public snapshot drift: committed ${committedNativeChecksum}, remote ${expectedChecksum}.`,
    );
  }
}

if (verifyMigrationFixture) {
  const expectedContent = buildPublicSnapshotContent(await loadFixtureRows(FIXTURE_PATH));
  const committedLegacyProjection = { ...committedLegacyContent, geographicNames: [] };

  if (JSON.stringify(committedLegacyProjection) !== JSON.stringify(expectedContent)) {
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
contaminatedFixture.entities.push(
  {
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
  },
  {
    id: 'entity-master-synthetic',
    slug: 'master-synthetic',
    entity_type: 'location',
    visibility: 'pin',
    audience: 'master',
    name: 'MAP053 MASTER SNAPSHOT CANARY',
    name_language: 'en',
    summary: 'Protected master content',
    description: 'Protected master content',
    x: 2,
    y: 2,
    category_id: 'category-settlement',
    publication_status: 'published',
  },
);
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
  throw new Error(
    'Draft, archived, Master or administrative fixture data changed the public projection.',
  );
}

const campaignA = '10000000-0000-4000-8000-000000000053';
const campaignB = '10000000-0000-4000-8000-000000000054';
const syntheticGlobalRows = {
  geographicNames: [
    {
      id: 'geo-shared-synthetic',
      slug: 'shared-synthetic',
      name: 'Shared synthetic geography',
      language: 'en',
      x: 100,
      y: 100,
      recommended_zoom: 1,
      entity_id: null,
      search_min_x: null,
      search_max_x: null,
      search_min_y: null,
      search_max_y: null,
      publication_status: 'published',
    },
  ],
  geographicAliases: [],
};
function syntheticCampaignRows(campaignId, suffix, x) {
  const categoryId = `category-${suffix}`;
  const publicEntityId = `entity-${suffix}-location`;
  const masterEntityId = `entity-${suffix}-master`;
  return {
    categories: [
      {
        id: categoryId,
        slug: `category-${suffix}`,
        name: `Category ${suffix}`,
        description: '',
        publication_status: 'published',
      },
    ],
    tags: [],
    players: [],
    entities: [
      {
        id: publicEntityId,
        slug: `${suffix}-location`,
        entity_type: 'location',
        visibility: 'pin',
        audience: 'public',
        name: `Public ${suffix}`,
        name_language: 'en',
        summary: '',
        description: '',
        x,
        y: x,
        category_id: categoryId,
        publication_status: 'published',
      },
      {
        id: masterEntityId,
        slug: `${suffix}-master`,
        entity_type: 'location',
        visibility: 'pin',
        audience: 'master',
        name: `MAP053 MASTER ${suffix} CANARY`,
        name_language: 'en',
        summary: 'Never public',
        description: 'Never public',
        x: x + 1,
        y: x + 1,
        category_id: categoryId,
        publication_status: 'published',
      },
    ],
    entityAliases: [],
    entityTags: [],
    dispositions: [],
    characterLocationRelations: [],
    notes: [],
    noteTags: [],
    locationEvents: [],
    geographicEntityLinks: [
      {
        campaign_id: campaignId,
        geographic_name_id: 'geo-shared-synthetic',
        entity_id: publicEntityId,
      },
    ],
  };
}

const syntheticRows = {
  campaigns: [
    { id: campaignA, slug: 'synthetic-a', name: 'Synthetic A', status: 'active', display_order: 1 },
    { id: campaignB, slug: 'synthetic-b', name: 'Synthetic B', status: 'active', display_order: 2 },
  ],
  global: syntheticGlobalRows,
  campaignsById: {
    [campaignA]: syntheticCampaignRows(campaignA, 'a', 101),
    [campaignB]: syntheticCampaignRows(campaignB, 'b', 201),
  },
};
const syntheticMulticampaignContent = buildPublicMulticampaignSnapshotContent(syntheticRows);
if (
  syntheticMulticampaignContent.campaigns.length !== 2 ||
  syntheticMulticampaignContent.campaignCatalogs.length !== 2 ||
  syntheticMulticampaignContent.geographicNames.length !== 1
) {
  throw new Error('MAP-053 synthetic snapshot does not preserve campaign/global cardinality.');
}
const projectedA = projectMulticampaignSnapshotContentToV2(
  syntheticMulticampaignContent,
  campaignA,
);
const projectedB = projectMulticampaignSnapshotContentToV2(
  syntheticMulticampaignContent,
  campaignB,
);
if (
  projectedA.geographicNames[0]?.entityId !== 'entity-a-location' ||
  projectedB.geographicNames[0]?.entityId !== 'entity-b-location'
) {
  throw new Error('MAP-053 synthetic snapshot did not isolate campaign geographic links.');
}
if (JSON.stringify(syntheticMulticampaignContent).includes('MAP053 MASTER')) {
  throw new Error('MAP-053 synthetic snapshot leaked Master content.');
}

const poisonedRows = structuredClone(syntheticRows);
poisonedRows.campaignsById[campaignB].geographicEntityLinks = [
  {
    campaign_id: campaignB,
    geographic_name_id: 'geo-shared-synthetic',
    entity_id: 'entity-b-master',
  },
];
let rejectedMasterLink = false;
try {
  buildPublicMulticampaignSnapshotContent(poisonedRows);
} catch {
  rejectedMasterLink = true;
}
if (!rejectedMasterLink) {
  throw new Error('MAP-053 snapshot accepted a geographic link to filtered Master content.');
}

const MAP080_CANARY = 'MAP080 MASTER CANARY NOT PRESENT';
const map080Fixture = structuredClone(syntheticRows);
const makeContext = (id, slug) => ({
  id,
  slug,
  name: slug,
  parent_id: null,
  width: 5000,
  height: 4000,
  image_uri: null,
  publication_status: 'published',
});
const localContextA = makeContext('map-synthetic-a', 'synthetic-a');
const localContextB = makeContext('map-synthetic-b', 'synthetic-b');
const localId = 'entity-synthetic-local-only';
const privateId = 'entity-synthetic-MASTER-CANARY';
const polyId = 'place-synthetic-local-region';
const polygon = {
  kind: 'polygon',
  vertices: [
    { x: 4000, y: 3000 },
    { x: 4300, y: 3000 },
    { x: 4300, y: 3400 },
    { x: 4000, y: 3400 },
  ],
};
const point = { kind: 'point', coordinates: { x: 4000, y: 3000 } };
const place = (mapId, entityId, geometry, x, y) => ({
  campaign_id: campaignA,
  map_context_id: mapId,
  entity_id: entityId,
  geometry,
  x,
  y,
  publication_status: 'published',
});
map080Fixture.localByCampaignId = {
  [campaignA]: {
    links: [
      {
        campaign_id: campaignA,
        geographic_name_id: 'geo-shared-synthetic',
        map_context_id: localContextA.id,
        map_contexts: localContextA,
      },
    ],
    placements: [
      place(localContextA.id, 'entity-a-location', point, 4000, 3000),
      place(localContextA.id, localId, point, 4000, 3000),
      place(localContextA.id, polyId, polygon, 4150, 3200),
      place(localContextA.id, privateId, point, 4000, 3000),
      {
        ...place(localContextA.id, localId, point, 4000, 3000),
        entity_id: 'entity-archived-canary',
        publication_status: 'archived',
      },
    ],
    localEntities: [
      {
        id: localId,
        slug: 'synthetic-local-only',
        entity_type: 'character',
        lifecycle_status: null,
        visibility: 'pin',
        name: 'Synthetic local entity',
        name_language: 'en',
        summary: 'Public',
        description: 'Public',
        portrait_path: null,
        x: null,
        y: null,
        geometry: null,
        category_id: 'category-a',
        world_map_enabled: false,
        publication_status: 'published',
        audience: 'public',
      },
      {
        id: polyId,
        slug: 'synthetic-local-region',
        entity_type: 'location',
        lifecycle_status: null,
        visibility: 'pin',
        name: 'Synthetic polygon region',
        name_language: 'en',
        summary: 'Public',
        description: 'Public',
        portrait_path: null,
        x: null,
        y: null,
        geometry: null,
        category_id: 'category-a',
        world_map_enabled: false,
        publication_status: 'published',
        audience: 'public',
      },
      {
        id: privateId,
        slug: 'master-canary',
        entity_type: 'character',
        lifecycle_status: null,
        visibility: 'pin',
        name: MAP080_CANARY,
        name_language: 'en',
        summary: MAP080_CANARY,
        description: MAP080_CANARY,
        portrait_path: null,
        x: null,
        y: null,
        geometry: null,
        category_id: 'category-a',
        world_map_enabled: false,
        publication_status: 'published',
        audience: 'master',
      },
    ],
    entityAliases: [
      {
        id: 'alias-synthetic-local',
        entity_id: localId,
        language: 'en',
        value: 'Public synthetic alias',
      },
    ],
    entityTags: [],
    notes: [
      {
        id: 'note-synthetic-private',
        slug: 'synthetic-private',
        entity_id: privateId,
        title: MAP080_CANARY,
        body: MAP080_CANARY,
        sort_order: 0,
        publication_status: 'published',
      },
    ],
    noteTags: [],
    dispositions: [],
    associations: [],
    entityRelations: [
      {
        left_entity_id: localId,
        right_entity_id: privateId,
        left_label: MAP080_CANARY,
        right_label: MAP080_CANARY,
      },
    ],
    characterLocationRelations: [],
  },
  [campaignB]: {
    links: [
      {
        campaign_id: campaignB,
        geographic_name_id: 'geo-shared-synthetic',
        map_context_id: localContextB.id,
        map_contexts: localContextB,
      },
    ],
    placements: [],
    localEntities: [],
    entityAliases: [],
    entityTags: [],
    notes: [],
    noteTags: [],
    dispositions: [],
    associations: [],
    entityRelations: [],
    characterLocationRelations: [],
  },
};
const map080Content = buildPublicMultimapSnapshotContent(map080Fixture);
assertPublicMultimapSnapshotContent(map080Content);
if (
  map080Content.mapContexts.length !== 2 ||
  map080Content.campaignLocalMaps[0].placements.length !== 3 ||
  map080Content.campaignLocalMaps[0].localOnlyEntities.length !== 2 ||
  map080Content.campaignLocalMaps[0].placements[2].geometry.kind !== 'polygon' ||
  map080Content.campaignCatalogs[0].entities.some((e) => e.id === localId) ||
  JSON.stringify(map080Content).includes(MAP080_CANARY)
) {
  throw new Error('MAP-080 world/local isolation or private canary exclusion failed.');
}
const poisonedMap080 = structuredClone(map080Fixture);
poisonedMap080.localByCampaignId[campaignA].links[0].campaign_id = campaignB;
let rejectedCrossCampaign = false;
try {
  buildPublicMultimapSnapshotContent(poisonedMap080);
} catch {
  rejectedCrossCampaign = true;
}
if (!rejectedCrossCampaign) throw new Error('MAP-080 accepted cross-campaign local binding.');
const maliciousMap080 = structuredClone(map080Content);
maliciousMap080.campaignLocalMaps[0].placements.push({
  contextId: 'map-synthetic-a',
  entityId: privateId,
  geometry: point,
  coordinates: { x: 4000, y: 3000 },
});
let rejectedPrivatePlacement = false;
try {
  assertPublicMultimapSnapshotContent(maliciousMap080);
} catch {
  rejectedPrivatePlacement = true;
}
if (!rejectedPrivatePlacement) throw new Error('MAP-080 accepted private placement.');

const serialized = JSON.stringify(snapshot);
for (const forbidden of [
  '"publication_status"',
  '"request_status"',
  '"moderation_note"',
  '"sender_name"',
  '"reason"',
  '"public_requests"',
  '"publicRequests"',
  '"audience"',
]) {
  if (serialized.includes(forbidden)) {
    throw new Error(`Public snapshot leaked a non-public field or domain marker: ${forbidden}.`);
  }
}

const verificationTarget = verifyRemote
  ? 'all active Supabase campaigns plus MAP-039 + MAP-040 + MAP-041 geographic coverage'
  : verifyMigrationFixture
    ? 'the historical MAP-028 migration fixture through the explicit MAP-053 compatibility projection'
    : 'canonical public content, MAP-053 multicampaign invariants, Master exclusion and geographic coverage';
console.log(
  `Verified public snapshot schema v${snapshot.schemaVersion} against ${verificationTarget}: ${committedNativeChecksum}.`,
);
