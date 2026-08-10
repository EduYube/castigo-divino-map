import { describe, expect, it } from 'vitest';

import type { PublicCatalogSnapshotV2 } from './beta02-model';
import type { CampaignCatalog } from './model';
import { searchPublicAtlas } from './search';

const emptyCampaignCatalog = {
  categories: [],
  tags: [],
  places: [],
  notes: [],
} as const satisfies CampaignCatalog;

const catalog = {
  schemaVersion: 2,
  generatedAt: '2026-08-10T17:00:00.000Z',
  sourceRevision: 'map-041-test',
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
          id: 'geo-alias-waterdeep-es',
          geographicNameId: 'geo-waterdeep',
          language: 'es',
          value: 'Aguas Profundas',
        },
      ],
      coordinates: { x: 1626, y: 1465 },
      searchExtent: null,
      recommendedZoom: 0.75,
      entityId: null,
    },
    {
      id: 'geo-sword-coast',
      slug: 'sword-coast',
      name: 'Sword Coast',
      language: 'en',
      aliases: [
        {
          id: 'geo-alias-sword-coast-es',
          geographicNameId: 'geo-sword-coast',
          language: 'es',
          value: 'Costa de la Espada',
        },
      ],
      coordinates: { x: 1450, y: 1049 },
      searchExtent: { minX: 1380, maxX: 1710, minY: 750, maxY: 1500 },
      recommendedZoom: 0.5,
      entityId: null,
    },
  ],
  characterLocationEvents: [],
} as const satisfies PublicCatalogSnapshotV2;

describe('MAP-041 geographic search identity geometry', () => {
  it('keeps Waterdeep and Aguas Profundas point-only with identical geometry', () => {
    const english = searchPublicAtlas(emptyCampaignCatalog, catalog, 'Waterdeep')[0];
    const spanish = searchPublicAtlas(emptyCampaignCatalog, catalog, 'Aguas Profundas')[0];

    expect(english).toMatchObject({
      id: 'geo-waterdeep',
      coordinates: { x: 1626, y: 1465 },
      searchExtent: null,
      recommendedZoom: 0.75,
    });
    expect(spanish).toMatchObject({
      id: english?.id,
      coordinates: english?.coordinates,
      searchExtent: english?.searchExtent,
      recommendedZoom: english?.recommendedZoom,
      matchKind: 'alias',
    });
  });

  it('resolves the Spanish Sword Coast alias to exactly the canonical extent', () => {
    const english = searchPublicAtlas(emptyCampaignCatalog, catalog, 'Sword Coast')[0];
    const spanish = searchPublicAtlas(emptyCampaignCatalog, catalog, 'Costa de la Espada')[0];

    expect(english).toMatchObject({
      id: 'geo-sword-coast',
      searchExtent: { minX: 1380, maxX: 1710, minY: 750, maxY: 1500 },
    });
    expect(spanish?.id).toBe(english?.id);
    expect(spanish?.coordinates).toEqual(english?.coordinates);
    expect(spanish?.searchExtent).toEqual(english?.searchExtent);
  });
});
