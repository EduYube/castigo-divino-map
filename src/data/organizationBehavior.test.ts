import { describe, expect, it } from 'vitest';

import type { PublicCatalogSnapshotV2 } from './beta02-model';
import { resolveFullEntityDetail } from './fullEntityDetails';
import type { CampaignCatalog } from './model';
import { createAtlasPinMarkerModels } from './pinMarkers';
import { searchPublicAtlas } from './search';

const legacyCatalog: CampaignCatalog = {
  categories: [{ id: 'category-fixture', slug: 'fixture', name: 'Fixture', description: '' }],
  tags: [],
  places: [],
  notes: [],
};

const catalog: PublicCatalogSnapshotV2 = {
  schemaVersion: 2,
  generatedAt: '2026-10-08T00:00:00.000Z',
  sourceRevision: 'map-069-test',
  checksum: 'sha256:map-069-test',
  categories: [{ id: 'category-fixture', slug: 'fixture', name: 'Fixture', description: '' }],
  tags: [],
  players: [],
  entities: [
    {
      id: 'entity-fixture-guild',
      slug: 'fixture-guild',
      entityType: 'organization',
      visibility: 'search_only',
      name: 'Fixture Guild',
      nameLanguage: 'en',
      aliases: [],
      summary: 'Synthetic organization.',
      description: 'Fixture only.',
      categoryId: 'category-fixture',
      tagIds: [],
    },
    {
      id: 'place-fixture-hall',
      slug: 'fixture-hall',
      entityType: 'location',
      visibility: 'pin',
      name: 'Fixture Hall',
      nameLanguage: 'en',
      aliases: [],
      summary: 'Synthetic headquarters.',
      description: 'Fixture only.',
      coordinates: { x: 100, y: 200 },
      categoryId: 'category-fixture',
      tagIds: [],
    },
  ],
  dispositions: [],
  entityRelations: [
    {
      leftEntityId: 'entity-fixture-guild',
      rightEntityId: 'place-fixture-hall',
      leftLabel: 'Sede / localización relacionada',
      rightLabel: 'Organización',
    },
  ],
  characterLocationRelations: [],
  notes: [],
  geographicNames: [],
  characterLocationEvents: [],
};

describe('MAP-069 public organization behavior', () => {
  it('keeps organizations searchable while excluding them from marker projection', () => {
    const search = searchPublicAtlas(legacyCatalog, catalog, 'Fixture Guild');
    expect(search).toContainEqual(
      expect.objectContaining({
        id: 'entity-fixture-guild',
        type: 'organization',
        coordinates: null,
      }),
    );

    const pins = createAtlasPinMarkerModels(legacyCatalog, catalog);
    expect(pins.some(({ entityId }) => entityId === 'entity-fixture-guild')).toBe(false);
    expect(pins.some(({ entityId }) => entityId === 'place-fixture-hall')).toBe(true);
  });

  it('renders a single stored organization/location relation from both endpoints', () => {
    const organization = resolveFullEntityDetail(catalog, 'fixture-guild');
    const building = resolveFullEntityDetail(catalog, 'fixture-hall');

    expect(organization?.relatedEntities).toEqual([
      expect.objectContaining({
        id: 'place-fixture-hall',
        relationLabel: 'Sede / localización relacionada',
      }),
    ]);
    expect(building?.relatedEntities).toEqual([
      expect.objectContaining({
        id: 'entity-fixture-guild',
        relationLabel: 'Organización',
      }),
    ]);
  });
});
