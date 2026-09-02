import { describe, expect, test } from 'vitest';

import { buildPublicCatalogEnvelopeV2, parsePublicCatalogSnapshotV2 } from './publicCatalogCodec';
import type { PublicCatalogTablePayloadsWithCharacterLocations } from './publicCharacterLocationRelations';

function lifecyclePayloads(): PublicCatalogTablePayloadsWithCharacterLocations {
  return {
    categories: [
      {
        id: 'category-map064',
        slug: 'map064',
        name: 'MAP-064',
        description: '',
      },
    ],
    tags: [],
    players: [],
    entities: [
      {
        id: 'entity-map064-snapshot-mission',
        slug: 'map064-snapshot-mission',
        entity_type: 'mission',
        lifecycle_status: 'completed',
        visibility: 'pin',
        name: 'Snapshot mission',
        name_language: 'en',
        summary: '',
        description: '',
        x: 1200,
        y: 800,
        category_id: 'category-map064',
      },
      {
        id: 'entity-map064-snapshot-hazard',
        slug: 'map064-snapshot-hazard',
        entity_type: 'hazard',
        lifecycle_status: 'resolved',
        visibility: 'pin',
        name: 'Snapshot hazard',
        name_language: 'en',
        summary: '',
        description: '',
        x: 1400,
        y: 900,
        category_id: 'category-map064',
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

describe('MAP-064 public snapshot compatibility', () => {
  test('round-trips public mission and hazard lifecycle without Supabase-specific state', async () => {
    const envelope = await buildPublicCatalogEnvelopeV2(lifecyclePayloads(), () =>
      Date.parse('2026-09-02T12:00:00.000Z'),
    );
    if (envelope.data.contract !== 'beta02') throw new Error('Expected Beta 0.2 projection.');

    expect(envelope.data.catalog.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'entity-map064-snapshot-mission',
          entityType: 'mission',
          lifecycleStatus: 'completed',
        }),
        expect.objectContaining({
          id: 'entity-map064-snapshot-hazard',
          entityType: 'hazard',
          lifecycleStatus: 'resolved',
        }),
      ]),
    );

    const parsed = await parsePublicCatalogSnapshotV2(envelope.data.catalog);
    if (parsed.data.contract !== 'beta02') throw new Error('Expected Beta 0.2 cache projection.');
    expect(parsed.data.catalog.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'entity-map064-snapshot-mission',
          entityType: 'mission',
          lifecycleStatus: 'completed',
        }),
        expect.objectContaining({
          id: 'entity-map064-snapshot-hazard',
          entityType: 'hazard',
          lifecycleStatus: 'resolved',
        }),
      ]),
    );
  });
});
