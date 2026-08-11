import { describe, expect, it } from 'vitest';

import type { PublicCatalogSnapshotV2 } from './beta02-model';
import { createAtlasPinMarkerModels } from './pinMarkers';
import type { CampaignCatalog } from './model';

const legacyCatalog: CampaignCatalog = {
  categories: [{ id: 'category-demo', slug: 'demo', name: 'Demo', description: '' }],
  tags: [],
  places: [
    {
      id: 'place-harbor',
      slug: 'harbor',
      name: 'Legacy Harbor',
      aliases: [],
      coordinates: { x: 100, y: 200 },
      categoryId: 'category-demo',
      tagIds: [],
    },
  ],
  notes: [],
};

const beta02Catalog: PublicCatalogSnapshotV2 = {
  schemaVersion: 2,
  generatedAt: '2026-08-07T00:00:00.000Z',
  sourceRevision: 'test',
  checksum: 'sha256:test',
  categories: [{ id: 'category-demo', slug: 'demo', name: 'Demo', description: '' }],
  tags: [],
  players: [
    { id: 'player-a', slug: 'a', displayName: 'A', nameLanguage: 'en' },
    { id: 'player-b', slug: 'b', displayName: 'B', nameLanguage: 'en' },
  ],
  entities: [
    {
      id: 'place-harbor',
      slug: 'harbor',
      entityType: 'location',
      visibility: 'pin',
      name: 'Harbor',
      nameLanguage: 'en',
      aliases: [],
      summary: '',
      description: '',
      coordinates: { x: 100, y: 200 },
      categoryId: 'category-demo',
      tagIds: [],
    },
    {
      id: 'entity-hero',
      slug: 'hero',
      entityType: 'character',
      visibility: 'pin',
      name: 'Hero',
      nameLanguage: 'en',
      aliases: [],
      summary: '',
      description: '',
      portraitPath: 'portraits/123e4567-e89b-42d3-a456-426614174000.webp',
      coordinates: { x: 100, y: 200 },
      categoryId: 'category-demo',
      tagIds: [],
    },
    {
      id: 'entity-hidden',
      slug: 'hidden',
      entityType: 'character',
      visibility: 'search_only',
      name: 'Hidden',
      nameLanguage: 'en',
      aliases: [],
      summary: '',
      description: '',
      coordinates: { x: 300, y: 400 },
      categoryId: 'category-demo',
      tagIds: [],
    },
  ],
  dispositions: [
    { entityId: 'place-harbor', playerId: 'player-a', disposition: 'ally' },
    { entityId: 'place-harbor', playerId: 'player-b', disposition: 'neutral' },
    { entityId: 'entity-hero', playerId: 'player-a', disposition: 'enemy' },
  ],
  characterLocationRelations: [],
  notes: [],
  geographicNames: [],
  characterLocationEvents: [],
};

describe('createAtlasPinMarkerModels', () => {
  it('enriches stable legacy locations and adds beta02 pin entities without search_only entities', () => {
    const pins = createAtlasPinMarkerModels(legacyCatalog, beta02Catalog);

    expect(pins.map(({ id }) => id)).toEqual(['place-harbor', 'entity-hero']);
    expect(pins[0]).toMatchObject({
      legacyPlaceId: 'place-harbor',
      entityId: 'place-harbor',
      entityType: 'location',
      source: 'beta02',
    });
    expect(pins[1]).toMatchObject({
      legacyPlaceId: null,
      entityType: 'character',
      portraitPath: 'portraits/123e4567-e89b-42d3-a456-426614174000.webp',
      source: 'beta02',
    });
  });

  it('keeps every player perspective and uses null only for missing projected rows', () => {
    const hero = createAtlasPinMarkerModels(legacyCatalog, beta02Catalog).find(
      ({ id }) => id === 'entity-hero',
    );

    expect(hero?.dispositions).toEqual([
      { playerId: 'player-a', playerName: 'A', disposition: 'enemy' },
      { playerId: 'player-b', playerName: 'B', disposition: null },
    ]);
  });

  it('keeps Beta 0.1 pins available before a beta02 projection exists', () => {
    expect(createAtlasPinMarkerModels(legacyCatalog, null)[0]).toMatchObject({
      id: 'place-harbor',
      legacyPlaceId: 'place-harbor',
      entityType: 'location',
      source: 'beta01',
      dispositions: [],
      portraitPath: null,
    });
  });
});
