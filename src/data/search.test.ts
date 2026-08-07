import { describe, expect, it } from 'vitest';

import type { PublicCatalogSnapshotV2 } from './beta02-model';
import { campaignCatalog } from './catalog';
import type { CampaignCatalog } from './model';
import { normalizePlaceSearchQuery, searchPublicAtlas, searchPublicPlaces } from './search';

const rankingCatalog = {
  categories: [],
  tags: [],
  places: [
    {
      id: 'place-partial',
      slug: 'partial',
      name: 'La ruta Alpha del norte',
      aliases: ['Camino antiguo'],
      coordinates: { x: 0, y: 0 },
      categoryId: 'category-demo',
      tagIds: [],
    },
    {
      id: 'place-prefix',
      slug: 'prefix',
      name: 'Alpha del bosque',
      aliases: ['Entrada verde'],
      coordinates: { x: 0, y: 0 },
      categoryId: 'category-demo',
      tagIds: [],
    },
    {
      id: 'place-exact',
      slug: 'exact',
      name: 'Alpha',
      aliases: ['ALPHA', 'Nombre repetido'],
      coordinates: { x: 0, y: 0 },
      categoryId: 'category-demo',
      tagIds: [],
    },
  ],
  notes: [
    {
      id: 'note-exact-duplicate',
      slug: 'exact-duplicate',
      placeId: 'place-exact',
      title: 'Alpha',
      body: 'El cuerpo no interviene al elegir la coincidencia representativa.',
      tagIds: [],
    },
  ],
} as const satisfies CampaignCatalog;

const beta02Catalog = {
  schemaVersion: 2,
  generatedAt: '2026-08-07T00:00:00.000Z',
  sourceRevision: 'map-021-test',
  checksum: `sha256:${'0'.repeat(64)}`,
  categories: [
    {
      id: 'category-demo',
      slug: 'demo',
      name: 'Demo',
      description: '',
    },
  ],
  tags: [],
  players: [],
  entities: [
    {
      id: 'entity-waterdeep',
      slug: 'waterdeep-campaign',
      entityType: 'location',
      visibility: 'pin',
      name: 'Waterdeep',
      nameLanguage: 'en',
      aliases: [],
      summary: '',
      description: '',
      coordinates: { x: 1690, y: 1020 },
      categoryId: 'category-demo',
      tagIds: [],
    },
    {
      id: 'entity-durnan',
      slug: 'durnan',
      entityType: 'character',
      visibility: 'search_only',
      name: 'Durnan',
      nameLanguage: 'en',
      aliases: [],
      summary: '',
      description: '',
      coordinates: { x: 1691, y: 1021 },
      categoryId: 'category-demo',
      tagIds: [],
    },
    {
      id: 'entity-yawning-portal',
      slug: 'yawning-portal',
      entityType: 'location',
      visibility: 'search_only',
      name: 'Yawning Portal',
      nameLanguage: 'en',
      aliases: [
        {
          id: 'alias-yawning-portal',
          entityId: 'entity-yawning-portal',
          language: 'en',
          value: 'The Portal',
        },
      ],
      summary: '',
      description: '',
      coordinates: { x: 1692, y: 1022 },
      categoryId: 'category-demo',
      tagIds: [],
    },
    {
      id: 'place-demo-harbor',
      slug: 'puerto-de-demostracion',
      entityType: 'location',
      visibility: 'pin',
      name: 'Demonstration Harbor',
      nameLanguage: 'en',
      aliases: [],
      summary: '',
      description: '',
      coordinates: { x: 2040, y: 1380 },
      categoryId: 'category-demo',
      tagIds: [],
    },
  ],
  dispositions: [],
  characterLocationRelations: [],
  notes: [],
  geographicNames: [
    {
      id: 'geo-waterdeep',
      slug: 'waterdeep',
      name: 'Waterdeep',
      language: 'en',
      aliases: [
        {
          id: 'geo-alias-city-of-splendors',
          geographicNameId: 'geo-waterdeep',
          language: 'en',
          value: 'City of Splendors',
        },
      ],
      coordinates: { x: 1690, y: 1020 },
      recommendedZoom: 1.5,
      entityId: 'entity-waterdeep',
    },
    {
      id: 'geo-sword-mountains',
      slug: 'sword-mountains',
      name: 'Sword Mountains',
      language: 'en',
      aliases: [],
      coordinates: { x: 1900, y: 940 },
      recommendedZoom: 0.5,
      entityId: null,
    },
    {
      id: 'geo-harbor-district',
      slug: 'harbor-district',
      name: 'Harbor District',
      language: 'en',
      aliases: [],
      coordinates: { x: 2040, y: 1380 },
      recommendedZoom: 2,
      entityId: 'place-demo-harbor',
    },
  ],
  characterLocationEvents: [],
} as const satisfies PublicCatalogSnapshotV2;

describe('place search normalization', () => {
  it('ignores uppercase and lowercase differences', () => {
    expect(normalizePlaceSearchQuery('PUERTO')).toBe('puerto');
  });

  it('removes accents and other diacritics', () => {
    expect(normalizePlaceSearchQuery('Información pública')).toBe('informacion publica');
  });

  it('trims outer whitespace and collapses whitespace sequences', () => {
    expect(normalizePlaceSearchQuery('  Puerto   de\n ejemplo  ')).toBe('puerto de ejemplo');
  });
});

describe('public place search', () => {
  it('matches a primary place name without accents or matching case', () => {
    expect(searchPublicPlaces(campaignCatalog, 'PUERTO DE DEMOSTRACION')).toEqual([
      {
        placeId: 'place-demo-harbor',
        placeName: 'Puerto de demostración',
        matchKind: 'name',
        matchedText: 'Puerto de demostración',
        matchRank: 0,
      },
    ]);
  });

  it('matches an alias and keeps the associated place identity', () => {
    expect(searchPublicPlaces(campaignCatalog, 'puerto de ejemplo')).toEqual([
      {
        placeId: 'place-demo-harbor',
        placeName: 'Puerto de demostración',
        matchKind: 'alias',
        matchedText: 'Puerto de ejemplo',
        matchRank: 0,
      },
    ]);
  });

  it('matches a public note title and keeps the associated place identity', () => {
    expect(searchPublicPlaces(campaignCatalog, 'referencia publica de viaje')).toEqual([
      {
        placeId: 'place-demo-pass',
        placeName: 'Paso de demostración',
        matchKind: 'note-title',
        matchedText: 'Referencia pública de viaje',
        matchRank: 0,
      },
    ]);
  });

  it('does not index the body of public notes', () => {
    expect(searchPublicPlaces(campaignCatalog, 'puerto ficticio')).toEqual([]);
  });

  it('orders exact matches before prefix and partial matches', () => {
    expect(searchPublicPlaces(rankingCatalog, 'alpha').map(({ placeId }) => placeId)).toEqual([
      'place-exact',
      'place-prefix',
      'place-partial',
    ]);
  });

  it('uses stable catalog order to resolve matches with the same rank', () => {
    expect(searchPublicPlaces(rankingCatalog, 'del').map(({ placeId }) => placeId)).toEqual([
      'place-partial',
      'place-prefix',
    ]);
  });

  it('returns no results for an empty normalized query', () => {
    expect(searchPublicPlaces(campaignCatalog, ' \n ')).toEqual([]);
  });

  it('returns each place once and chooses the strongest stable source', () => {
    expect(searchPublicPlaces(rankingCatalog, 'alpha')).toContainEqual({
      placeId: 'place-exact',
      placeName: 'Alpha',
      matchKind: 'name',
      matchedText: 'Alpha',
      matchRank: 0,
    });
    expect(
      searchPublicPlaces(rankingCatalog, 'alpha').filter(
        ({ placeId }) => placeId === 'place-exact',
      ),
    ).toHaveLength(1);
  });
});

describe('public atlas search', () => {
  it('keeps a geographic identity separate from a linked campaign location with the same name', () => {
    expect(searchPublicAtlas(campaignCatalog, beta02Catalog, 'Waterdeep')).toEqual([
      expect.objectContaining({
        id: 'geo-waterdeep',
        type: 'geographic',
        linkedEntityId: 'entity-waterdeep',
        recommendedZoom: 1.5,
      }),
      expect.objectContaining({
        id: 'entity-waterdeep',
        type: 'location',
        linkedEntityId: 'entity-waterdeep',
      }),
    ]);
  });

  it('matches English geographic aliases without creating campaign entities', () => {
    expect(searchPublicAtlas(campaignCatalog, beta02Catalog, 'City of Splendors')).toEqual([
      expect.objectContaining({
        id: 'geo-waterdeep',
        type: 'geographic',
        matchKind: 'alias',
        matchedText: 'City of Splendors',
      }),
    ]);
  });

  it('returns an unlinked geographic name with its own coordinates and zoom', () => {
    expect(searchPublicAtlas(campaignCatalog, beta02Catalog, 'Sword Mountains')).toEqual([
      expect.objectContaining({
        id: 'geo-sword-mountains',
        type: 'geographic',
        coordinates: { x: 1900, y: 940 },
        recommendedZoom: 0.5,
        legacyPlaceId: null,
        linkedEntityId: null,
      }),
    ]);
  });

  it('distinguishes characters from campaign locations', () => {
    expect(searchPublicAtlas(campaignCatalog, beta02Catalog, 'Durnan')).toEqual([
      expect.objectContaining({ id: 'entity-durnan', type: 'character' }),
    ]);
    expect(searchPublicAtlas(campaignCatalog, beta02Catalog, 'The Portal')).toEqual([
      expect.objectContaining({
        id: 'entity-yawning-portal',
        type: 'location',
        matchKind: 'alias',
      }),
    ]);
  });

  it('allows a geographic result linked to an existing Beta 0.1 place to expose that card separately', () => {
    expect(searchPublicAtlas(campaignCatalog, beta02Catalog, 'Harbor District')).toEqual([
      expect.objectContaining({
        id: 'geo-harbor-district',
        type: 'geographic',
        legacyPlaceId: 'place-demo-harbor',
        linkedEntityId: 'place-demo-harbor',
      }),
    ]);
  });

  it('does not duplicate a legacy location when the Beta 0.2 entity preserves its identity', () => {
    const results = searchPublicAtlas(campaignCatalog, beta02Catalog, 'puerto de ejemplo');

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      expect.objectContaining({
        id: 'place-demo-harbor',
        type: 'location',
        legacyPlaceId: 'place-demo-harbor',
      }),
    );
  });

  it('keeps deterministic type ordering for equally strong matches', () => {
    expect(searchPublicAtlas(campaignCatalog, beta02Catalog, 'Waterdeep').map(({ type }) => type)).toEqual([
      'geographic',
      'location',
    ]);
  });

  it('preserves the legacy search surface while Beta 0.2 data is unavailable', () => {
    expect(searchPublicAtlas(campaignCatalog, null, 'Referencia pública de viaje')).toEqual([
      expect.objectContaining({
        id: 'place-demo-pass',
        type: 'location',
        legacyPlaceId: 'place-demo-pass',
        matchKind: 'note-title',
      }),
    ]);
  });
});
