import { readFile } from 'node:fs/promises';

import { assertGeographicSearchExtentCoverage } from '../src/data-access/geographicSearchExtentContract.js';
import {
  assertPublicMulticampaignSnapshotContent,
  buildPublicMulticampaignSnapshotContent,
  buildPublicSnapshotContent,
  checksum,
  FIXTURE_PATH,
  INITIAL_PUBLIC_CAMPAIGN,
  loadFixtureRows,
  loadRemotePublicMulticampaignRows,
  projectMulticampaignSnapshotContentToV2,
  SNAPSHOT_PATH,
  snapshotContent,
  upgradeLegacySnapshotContentV2,
} from './public-snapshot-lib.mjs';

const verifyRemote = process.argv.includes('--remote');
const verifyMigrationFixture = process.argv.includes('--migration-fixture');
const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'));

if (verifyRemote && verifyMigrationFixture) {
  throw new Error('Choose either --remote or --migration-fixture, not both.');
}
if (snapshot.schemaVersion !== 2 && snapshot.schemaVersion !== 3) {
  throw new Error('The committed public snapshot must use schemaVersion 2 or 3.');
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

const committedMulticampaignContent =
  snapshot.schemaVersion === 3
    ? committedNativeContent
    : upgradeLegacySnapshotContentV2(committedNativeContent);
const committedLegacyContent =
  snapshot.schemaVersion === 3
    ? projectMulticampaignSnapshotContentToV2(committedMulticampaignContent)
    : committedNativeContent;

assertPublicMulticampaignSnapshotContent(committedMulticampaignContent);
assertGeographicSearchExtentCoverage(
  snapshot.schemaVersion === 3 ? committedMulticampaignContent : committedLegacyContent,
  'the committed public snapshot',
);

if (verifyRemote) {
  const expectedMulticampaignContent = buildPublicMulticampaignSnapshotContent(
    await loadRemotePublicMulticampaignRows(),
  );
  assertGeographicSearchExtentCoverage(expectedMulticampaignContent, 'Supabase published data');

  if (snapshot.schemaVersion === 3) {
    const expectedChecksum = checksum(expectedMulticampaignContent);
    if (expectedChecksum !== committedNativeChecksum) {
      throw new Error(
        `Public snapshot drift: committed ${committedNativeChecksum}, Supabase published data ${expectedChecksum}.`,
      );
    }
    if (JSON.stringify(committedNativeContent) !== JSON.stringify(expectedMulticampaignContent)) {
      throw new Error('Public snapshot order/content differs from Supabase multicampaign data.');
    }
  } else {
    if (
      expectedMulticampaignContent.campaigns.length !== 1 ||
      expectedMulticampaignContent.campaigns[0]?.id !== INITIAL_PUBLIC_CAMPAIGN.id
    ) {
      throw new Error(
        'The legacy schema v2 snapshot cannot represent every active campaign; regenerate schema v3 before deployment.',
      );
    }

    const expectedLegacyContent = projectMulticampaignSnapshotContentToV2(
      expectedMulticampaignContent,
      INITIAL_PUBLIC_CAMPAIGN.id,
    );
    const expectedChecksum = checksum(expectedLegacyContent);
    if (expectedChecksum !== committedNativeChecksum) {
      throw new Error(
        `Public snapshot drift: committed ${committedNativeChecksum}, Supabase initial campaign ${expectedChecksum}.`,
      );
    }
    if (JSON.stringify(committedNativeContent) !== JSON.stringify(expectedLegacyContent)) {
      throw new Error('Legacy snapshot order/content differs from the migrated initial campaign.');
    }
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
