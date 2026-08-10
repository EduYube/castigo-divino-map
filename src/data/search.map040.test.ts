import { describe, expect, it } from 'vitest';

import type { PublicCatalogSnapshotV2 } from './beta02-model';
import type { CampaignCatalog } from './model';
import { searchPublicAtlas } from './search';
import { getPublicAtlasSuggestions } from './searchSuggestions';

const emptyCampaignCatalog = {
  categories: [],
  tags: [],
  places: [],
  notes: [],
} as const satisfies CampaignCatalog;

const spanishCatalog = {
  schemaVersion: 2,
  generatedAt: '2026-08-10T14:45:00.000Z',
  sourceRevision: 'map-040-test',
  checksum: `sha256:${'0'.repeat(64)}`,
  categories: [],
  tags: [],
  players: [],
  entities: [],
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
          id: 'geo-alias-waterdeep-city-of-splendors',
          geographicNameId: 'geo-waterdeep',
          language: 'en',
          value: 'City of Splendors',
        },
        {
          id: 'geo-alias-waterdeep-es',
          geographicNameId: 'geo-waterdeep',
          language: 'es',
          value: 'Aguas Profundas',
        },
      ],
      coordinates: { x: 1626, y: 1465 },
      recommendedZoom: 0.75,
      entityId: null,
    },
    {
      id: 'geo-elturel',
      slug: 'elturel',
      name: 'Elturel',
      language: 'en',
      aliases: [],
      coordinates: { x: 2145, y: 879 },
      recommendedZoom: 0.75,
      entityId: null,
    },
    {
      id: 'geo-cormyr',
      slug: 'cormyr',
      name: 'Cormyr',
      language: 'en',
      aliases: [],
      coordinates: { x: 2870, y: 769 },
      recommendedZoom: 0.5,
      entityId: null,
    },
  ],
  characterLocationEvents: [],
} as const satisfies PublicCatalogSnapshotV2;

describe('MAP-040 Spanish geographic search', () => {
  it('resolves the canonical English and official Spanish names to the same identity', () => {
    const english = searchPublicAtlas(emptyCampaignCatalog, spanishCatalog, 'Waterdeep');
    const spanish = searchPublicAtlas(emptyCampaignCatalog, spanishCatalog, 'Aguas Profundas');

    expect(english).toHaveLength(1);
    expect(spanish).toHaveLength(1);
    expect(english[0]).toMatchObject({
      id: 'geo-waterdeep',
      type: 'geographic',
      name: 'Waterdeep',
      coordinates: { x: 1626, y: 1465 },
      recommendedZoom: 0.75,
    });
    expect(spanish[0]).toEqual({
      ...english[0],
      matchKind: 'alias',
      matchedText: 'Aguas Profundas',
    });
  });

  it('offers Waterdeep for a partial Spanish alias query', () => {
    expect(getPublicAtlasSuggestions(emptyCampaignCatalog, spanishCatalog, 'aguas')).toEqual([
      expect.objectContaining({
        id: 'geo-waterdeep',
        name: 'Waterdeep',
        matchKind: 'alias',
        matchedText: 'Aguas Profundas',
        matchRank: 1,
      }),
    ]);
  });

  it('preserves normalization of case, accents and whitespace for Spanish aliases', () => {
    expect(
      searchPublicAtlas(emptyCampaignCatalog, spanishCatalog, '  AGUAS   PROFUNDAS  ')[0],
    ).toMatchObject({
      id: 'geo-waterdeep',
      matchKind: 'alias',
      matchRank: 0,
    });
  });

  it('keeps an officially unchanged name searchable only through its canonical form', () => {
    expect(searchPublicAtlas(emptyCampaignCatalog, spanishCatalog, 'Elturel')).toEqual([
      expect.objectContaining({ id: 'geo-elturel', matchKind: 'name' }),
    ]);
  });

  it('does not invent a Spanish alias for an unverified identity', () => {
    expect(searchPublicAtlas(emptyCampaignCatalog, spanishCatalog, 'Cormiria')).toEqual([]);
    expect(searchPublicAtlas(emptyCampaignCatalog, spanishCatalog, 'Cormyr')).toEqual([
      expect.objectContaining({ id: 'geo-cormyr', matchKind: 'name' }),
    ]);
  });

  it('does not create a parallel geographic identity for the translated alias', () => {
    expect(spanishCatalog.geographicNames.filter(({ id }) => id === 'geo-waterdeep')).toHaveLength(
      1,
    );
    expect(spanishCatalog.geographicNames.map(({ name }) => String(name))).not.toContain(
      'Aguas Profundas',
    );
  });
});
