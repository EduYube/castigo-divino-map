import { describe, expect, test } from 'vitest';

import type { PublicCatalogSnapshotV2 } from '../../data/beta02-model';
import { createSha256Checksum } from '../../data-access/publicCatalog';
import { buildPublicCatalogEnvelopeV2, parsePublicCatalogSnapshotV2 } from './publicCatalogCodec';
import type { PublicCatalogTablePayloadsWithCharacterLocations } from './publicCharacterLocationRelations';

interface MutableSnapshotShape extends Record<string, unknown> {
  generatedAt: string;
  sourceRevision: string;
  checksum: string;
  categories: Record<string, unknown>[];
  entities: Array<Record<string, unknown> & { coordinates: Record<string, unknown> }>;
  characterLocationRelations: Record<string, unknown>[];
  characterLocationEvents: Array<Record<string, unknown> & { location: Record<string, unknown> }>;
}

function validPayloads(): PublicCatalogTablePayloadsWithCharacterLocations {
  return {
    categories: [
      {
        id: 'category-people',
        slug: 'people',
        name: 'People',
        description: '',
      },
      {
        id: 'category-places',
        slug: 'places',
        name: 'Places',
        description: '',
      },
    ],
    tags: [{ id: 'known', name: 'Known', description: '' }],
    players: [
      {
        id: 'player-one',
        slug: 'player-one',
        display_name: 'Player One',
        name_language: 'en',
        accent_color: '#475569',
      },
    ],
    entities: [
      {
        id: 'entity-hero',
        slug: 'hero',
        entity_type: 'character',
        visibility: 'pin',
        name: 'Hero',
        name_language: 'en',
        summary: '',
        description: '',
        x: 100,
        y: 100,
        category_id: 'category-people',
      },
      {
        id: 'entity-city',
        slug: 'city',
        entity_type: 'location',
        visibility: 'pin',
        name: 'City',
        name_language: 'en',
        summary: '',
        description: '',
        x: 200,
        y: 200,
        category_id: 'category-places',
      },
    ],
    entityAliases: [
      {
        id: 'alias-hero',
        entity_id: 'entity-hero',
        language: 'en',
        value: 'The Hero',
      },
    ],
    entityTags: [
      { entity_id: 'entity-hero', tag_id: 'known' },
      { entity_id: 'entity-city', tag_id: 'known' },
    ],
    dispositions: [
      {
        entity_id: 'entity-hero',
        player_id: 'player-one',
        disposition: 'ally',
      },
    ],
    associations: [],
    characterLocationRelations: [
      {
        character_id: 'entity-hero',
        location_id: 'entity-city',
        relation_status: 'present',
      },
    ],
    notes: [
      {
        id: 'note-hero',
        slug: 'hero-note',
        entity_id: 'entity-hero',
        title: 'Hero note',
        body: 'Public body',
        sort_order: 0,
      },
    ],
    noteTags: [{ note_id: 'note-hero', tag_id: 'known' }],
    geographicNames: [
      {
        id: 'geo-city',
        slug: 'city-label',
        name: 'City',
        language: 'en',
        x: 200,
        y: 200,
        recommended_zoom: 1,
        entity_id: 'entity-city',
      },
    ],
    geographicAliases: [
      {
        id: 'geo-alias-city',
        geographic_name_id: 'geo-city',
        language: 'en',
        value: 'The City',
      },
    ],
    locationEvents: [
      {
        id: 'location-event-hero-city',
        character_id: 'entity-hero',
        event_type: 'sighting',
        location_entity_id: 'entity-city',
        geographic_name_id: 'geo-city',
        x: null,
        y: null,
        location_label: null,
        summary: 'Seen in the city.',
        language: 'en',
        observed_at: '2026-08-06T00:00:00.000Z',
        related_sighting_id: null,
      },
    ],
  };
}

async function validSnapshot(): Promise<PublicCatalogSnapshotV2> {
  const envelope = await buildPublicCatalogEnvelopeV2(validPayloads(), () =>
    Date.parse('2026-08-06T00:00:00.000Z'),
  );

  if (envelope.data.contract !== 'beta02') {
    throw new Error('Expected Beta 0.2 projection.');
  }

  return envelope.data.catalog;
}

async function tamperedSnapshot(
  mutate: (snapshot: MutableSnapshotShape) => void,
): Promise<MutableSnapshotShape> {
  const snapshot = structuredClone(await validSnapshot()) as unknown as MutableSnapshotShape;
  mutate(snapshot);
  const content = Object.fromEntries(
    Object.entries(snapshot).filter(
      ([key]) => key !== 'generatedAt' && key !== 'sourceRevision' && key !== 'checksum',
    ),
  );
  const checksum = await createSha256Checksum(content);
  snapshot.sourceRevision = checksum;
  snapshot.checksum = checksum;

  return snapshot;
}

async function expectInvalidCache(value: unknown): Promise<void> {
  await expect(parsePublicCatalogSnapshotV2(value)).rejects.toMatchObject({
    code: 'invalid-response',
    source: 'cache',
  });
}

describe('parsePublicCatalogSnapshotV2', () => {
  test('revalidates and accepts a complete snapshot produced from Supabase rows', async () => {
    const snapshot = await validSnapshot();
    const result = await parsePublicCatalogSnapshotV2(snapshot);

    expect(result.source).toBe('session-cache');
    expect(result.data.contract).toBe('beta02');
  });

  test('rejects duplicate identifiers even when the checksum is coherent', async () => {
    const snapshot = await tamperedSnapshot((value) => {
      value.categories.push(structuredClone(value.categories[0] ?? {}));
    });

    await expectInvalidCache(snapshot);
  });

  test('rejects coordinates outside the public map bounds', async () => {
    const snapshot = await tamperedSnapshot((value) => {
      const entity = value.entities[0];

      if (entity) {
        entity.coordinates.x = 3601;
      }
    });

    await expectInvalidCache(snapshot);
  });

  test('rejects enum values outside the public contract', async () => {
    const snapshot = await tamperedSnapshot((value) => {
      const entity = value.entities[0];

      if (entity) {
        entity.entityType = 'deity';
      }
    });

    await expectInvalidCache(snapshot);
  });

  test('rejects malformed nested location fields', async () => {
    const snapshot = await tamperedSnapshot((value) => {
      const event = value.characterLocationEvents[0];

      if (event) {
        event.location.coordinates = 'not-an-object';
      }
    });

    await expectInvalidCache(snapshot);
  });

  test('rejects a character event whose characterId points to a location', async () => {
    const snapshot = await tamperedSnapshot((value) => {
      const event = value.characterLocationEvents[0];

      if (event) {
        event.characterId = 'entity-city';
      }
    });

    await expectInvalidCache(snapshot);
  });

  test('rejects a location reference that points to a character', async () => {
    const snapshot = await tamperedSnapshot((value) => {
      const event = value.characterLocationEvents[0];

      if (event) {
        event.location.locationEntityId = 'entity-hero';
      }
    });

    await expectInvalidCache(snapshot);
  });

  test('rejects a relation whose location endpoint points to a character', async () => {
    const snapshot = await tamperedSnapshot((value) => {
      const relation = value.characterLocationRelations[0];

      if (relation) {
        relation.locationId = 'entity-hero';
      }
    });

    await expectInvalidCache(snapshot);
  });
});
