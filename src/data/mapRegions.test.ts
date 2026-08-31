import { describe, expect, it } from 'vitest';

import type { PublicCatalogSnapshotV2 } from './beta02-model';
import type { CampaignCatalog } from './model';
import { createAtlasRegionModels } from './mapRegions';

const legacyCatalog: CampaignCatalog = {
  categories: [{ id: 'category-places', slug: 'places', name: 'Places', description: '' }],
  tags: [],
  places: [
    {
      id: 'place-cromryn',
      slug: 'cromryn',
      name: 'Legacy Cromryn',
      aliases: [],
      coordinates: { x: 200, y: 200 },
      categoryId: 'category-places',
      tagIds: [],
    },
  ],
  notes: [],
};

function catalog(visibility: 'pin' | 'search_only' = 'pin'): PublicCatalogSnapshotV2 {
  return {
    schemaVersion: 2,
    generatedAt: '2026-08-31T00:00:00.000Z',
    sourceRevision: 'test',
    checksum: 'sha256:test',
    categories: [{ id: 'category-places', slug: 'places', name: 'Places', description: '' }],
    tags: [],
    players: [],
    entities: [
      {
        id: 'place-cromryn',
        slug: 'cromryn',
        entityType: 'location',
        visibility,
        name: 'Cromryn',
        nameLanguage: 'en',
        aliases: [],
        summary: '',
        description: '',
        coordinates: { x: 200, y: 200 },
        geometry: {
          kind: 'polygon',
          vertices: [
            { x: 100, y: 100 },
            { x: 300, y: 100 },
            { x: 300, y: 300 },
            { x: 100, y: 300 },
          ],
        },
        categoryId: 'category-places',
        tagIds: [],
      },
      {
        id: 'entity-point',
        slug: 'point',
        entityType: 'location',
        visibility: 'pin',
        name: 'Point',
        nameLanguage: 'en',
        aliases: [],
        summary: '',
        description: '',
        coordinates: { x: 500, y: 500 },
        categoryId: 'category-places',
        tagIds: [],
      },
    ],
    dispositions: [],
    associations: [],
    characterLocationRelations: [],
    notes: [],
    geographicNames: [],
    characterLocationEvents: [],
  };
}

describe('createAtlasRegionModels', () => {
  it('derives one map area for a visible persistent polygon and keeps stable legacy identity', () => {
    const regions = createAtlasRegionModels(legacyCatalog, catalog());

    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      id: 'place-cromryn',
      entityId: 'place-cromryn',
      legacyPlaceId: 'place-cromryn',
      name: 'Cromryn',
      bounds: { minX: 100, maxX: 300, minY: 100, maxY: 300 },
      vertices: [
        [100, 100],
        [100, 300],
        [300, 300],
        [300, 100],
      ],
      detailMarker: {
        entityId: 'place-cromryn',
        coordinate: [200, 200],
        source: 'beta02',
      },
    });
  });

  it('does not render search_only polygons as persistent regions', () => {
    expect(createAtlasRegionModels(legacyCatalog, catalog('search_only'))).toEqual([]);
  });
});
