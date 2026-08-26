import { describe, expect, test } from 'vitest';

import { createSha256Checksum } from '../../data-access/publicCatalog';
import { parsePublicCatalogSnapshotV3 } from './multicampaignSnapshotCodec';

const CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';
const GENERATED_AT = '2026-08-26T00:00:00.000Z';

const category = {
  id: 'category-map053-snapshot',
  slug: 'map053-snapshot',
  name: 'MAP053 snapshot',
  description: '',
};

const character = {
  id: 'entity-map053-snapshot-character',
  slug: 'map053-snapshot-character',
  entityType: 'character',
  visibility: 'pin',
  name: 'MAP053 snapshot character',
  nameLanguage: 'en',
  aliases: [],
  summary: '',
  description: '',
  coordinates: { x: 801, y: 801 },
  categoryId: category.id,
  tagIds: [],
};

const location = {
  id: 'entity-map053-snapshot-location',
  slug: 'map053-snapshot-location',
  entityType: 'location',
  visibility: 'pin',
  name: 'MAP053 snapshot location',
  nameLanguage: 'en',
  aliases: [],
  summary: '',
  description: '',
  coordinates: { x: 802, y: 802 },
  categoryId: category.id,
  tagIds: [],
};

const publicSighting = {
  id: 'location-event-map053-snapshot-sighting',
  characterId: character.id,
  eventType: 'sighting',
  location: {
    locationEntityId: location.id,
    geographicNameId: null,
    coordinates: null,
    locationLabel: 'Public sighting',
  },
  summary: '',
  language: 'en',
  observedAt: '2026-08-20T10:00:00.000Z',
  relatedSightingId: null,
};

const dependentDeparture = {
  id: 'location-event-map053-snapshot-departure',
  characterId: character.id,
  eventType: 'departure',
  location: {
    locationEntityId: location.id,
    geographicNameId: null,
    coordinates: null,
    locationLabel: 'Public departure',
  },
  summary: '',
  language: 'en',
  observedAt: '2026-08-20T11:00:00.000Z',
  relatedSightingId: publicSighting.id,
};

async function snapshotWithEvents(characterLocationEvents: readonly unknown[]) {
  const content = {
    schemaVersion: 3 as const,
    campaigns: [
      {
        id: CAMPAIGN_ID,
        slug: 'castigo-divino',
        name: 'Castigo Divino',
        status: 'active' as const,
        displayOrder: 0,
      },
    ],
    campaignCatalogs: [
      {
        campaignId: CAMPAIGN_ID,
        categories: [category],
        tags: [],
        players: [],
        entities: [character, location],
        dispositions: [],
        characterLocationRelations: [],
        notes: [],
        characterLocationEvents,
        geographicEntityLinks: [],
      },
    ],
    geographicNames: [],
  };
  const checksum = await createSha256Checksum(content);

  return {
    ...content,
    generatedAt: GENERATED_AT,
    sourceRevision: checksum,
    checksum,
  };
}

describe('MAP-053 related sighting snapshot closure', () => {
  test('accepts a departure when its related sighting is present in the same public catalog', async () => {
    const snapshot = await snapshotWithEvents([publicSighting, dependentDeparture]);

    await expect(
      parsePublicCatalogSnapshotV3(snapshot, () => Date.parse(GENERATED_AT)),
    ).resolves.toMatchObject({ metadata: { schemaVersion: 3 } });
  });

  test('rejects a public departure whose related sighting was filtered from the public projection', async () => {
    const snapshot = await snapshotWithEvents([dependentDeparture]);

    await expect(
      parsePublicCatalogSnapshotV3(snapshot, () => Date.parse(GENERATED_AT)),
    ).rejects.toThrow(/avistamiento inválido/i);
  });
});
