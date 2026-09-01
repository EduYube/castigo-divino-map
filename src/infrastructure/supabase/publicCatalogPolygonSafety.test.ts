import { describe, expect, test } from 'vitest';

import { buildPublicCatalogEnvelopeV2 } from './publicCatalogCodec';
import type { PublicCatalogTablePayloadsWithCharacterLocations } from './publicCharacterLocationRelations';

function payloadsWithGeometry(
  geometry: Record<string, unknown>,
): PublicCatalogTablePayloadsWithCharacterLocations {
  return {
    categories: [{ id: 'category-places', slug: 'places', name: 'Places', description: '' }],
    tags: [],
    players: [],
    entities: [
      {
        id: 'entity-crossing-region',
        slug: 'crossing-region',
        entity_type: 'location',
        visibility: 'pin',
        name: 'Crossing region',
        name_language: 'en',
        summary: '',
        description: '',
        x: 200,
        y: 175,
        geometry,
        category_id: 'category-places',
      },
    ],
    entityAliases: [],
    entityTags: [],
    dispositions: [],
    associations: [],
    characterLocationRelations: [],
    notes: [],
    noteTags: [],
    geographicNames: [],
    geographicAliases: [],
    locationEvents: [],
  };
}

describe('public polygon geometry boundary', () => {
  test('rejects a self-intersecting polygon even when its signed area is positive', async () => {
    const geometry = {
      kind: 'polygon',
      vertices: [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 300 },
        { x: 200, y: 50 },
      ],
    };

    await expect(
      buildPublicCatalogEnvelopeV2(payloadsWithGeometry(geometry)),
    ).rejects.toMatchObject({
      code: 'invalid-response',
      source: 'supabase',
    });
  });
});
