import { describe, expect, it } from 'vitest';

import type { PublicCatalogSnapshotV2 } from './beta02-model';
import type { CampaignCatalog } from './model';
import { createAtlasPinMarkerModels } from './pinMarkers';

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
      mapPresentation: { kind: 'point' },
      source: 'beta02',
    });
    expect(pins[1]).toMatchObject({
      legacyPlaceId: null,
      entityType: 'character',
      portraitPath: 'portraits/123e4567-e89b-42d3-a456-426614174000.webp',
      mapPresentation: { kind: 'point' },
      source: 'beta02',
    });
  });

  it('renders only non-neutral configured relations in campaign roster order', () => {
    const pins = createAtlasPinMarkerModels(legacyCatalog, beta02Catalog);
    const harbor = pins.find(({ id }) => id === 'place-harbor');
    const hero = pins.find(({ id }) => id === 'entity-hero');

    expect(harbor?.dispositions).toEqual([
      { playerId: 'player-a', playerName: 'A', disposition: 'ally' },
    ]);
    expect(hero?.dispositions).toEqual([
      { playerId: 'player-a', playerName: 'A', disposition: 'enemy' },
    ]);
  });

  it('renders zero indicators when every campaign relation is neutral', () => {
    const neutralCatalog: PublicCatalogSnapshotV2 = {
      ...beta02Catalog,
      dispositions: beta02Catalog.players.map((player) => ({
        entityId: 'place-harbor' as const,
        playerId: player.id,
        disposition: 'neutral' as const,
      })),
    };

    const harbor = createAtlasPinMarkerModels(legacyCatalog, neutralCatalog).find(
      ({ id }) => id === 'place-harbor',
    );

    expect(harbor?.dispositions).toEqual([]);
  });

  it('supports a one-player campaign without fixed indicator slots', () => {
    const singlePlayerCatalog: PublicCatalogSnapshotV2 = {
      ...beta02Catalog,
      players: [beta02Catalog.players[1]!],
      dispositions: [
        { entityId: 'place-harbor', playerId: 'player-b', disposition: 'enemy' },
      ],
    };

    expect(
      createAtlasPinMarkerModels(legacyCatalog, singlePlayerCatalog).find(
        ({ id }) => id === 'place-harbor',
      )?.dispositions,
    ).toEqual([{ playerId: 'player-b', playerName: 'B', disposition: 'enemy' }]);
  });

  it('ignores disposition rows outside the selected campaign roster', () => {
    const campaignScopedCatalog: PublicCatalogSnapshotV2 = {
      ...beta02Catalog,
      players: [beta02Catalog.players[1]!],
      dispositions: [
        { entityId: 'place-harbor', playerId: 'player-a', disposition: 'ally' },
        { entityId: 'place-harbor', playerId: 'player-b', disposition: 'enemy' },
      ],
    };

    expect(
      createAtlasPinMarkerModels(legacyCatalog, campaignScopedCatalog).find(
        ({ id }) => id === 'place-harbor',
      )?.dispositions,
    ).toEqual([{ playerId: 'player-b', playerName: 'B', disposition: 'enemy' }]);
  });

  it('keeps Beta 0.1 pins available before a beta02 projection exists', () => {
    expect(createAtlasPinMarkerModels(legacyCatalog, null)[0]).toMatchObject({
      id: 'place-harbor',
      legacyPlaceId: 'place-harbor',
      entityType: 'location',
      source: 'beta01',
      dispositions: [],
      portraitPath: null,
      mapPresentation: { kind: 'point' },
    });
  });

  it('represents a stable polygon as a region model instead of a point fallback', () => {
    const polygonCatalog: PublicCatalogSnapshotV2 = {
      ...beta02Catalog,
      entities: beta02Catalog.entities.map((entity) =>
        entity.id === 'place-harbor'
          ? {
              ...entity,
              geometry: {
                kind: 'polygon' as const,
                vertices: [
                  { x: 50, y: 150 },
                  { x: 150, y: 150 },
                  { x: 150, y: 250 },
                  { x: 50, y: 250 },
                ],
              },
              coordinates: { x: 100, y: 200 },
            }
          : entity,
      ),
    };

    const models = createAtlasPinMarkerModels(legacyCatalog, polygonCatalog);
    expect(models.map(({ id }) => id)).toEqual(['place-harbor', 'entity-hero']);
    expect(models[0]).toMatchObject({
      id: 'place-harbor',
      legacyPlaceId: 'place-harbor',
      entityId: 'place-harbor',
      coordinate: [200, 100],
      mapPresentation: {
        kind: 'polygon',
        vertices: [
          [150, 50],
          [150, 150],
          [250, 150],
          [250, 50],
        ],
        bounds: { minX: 50, maxX: 150, minY: 150, maxY: 250 },
      },
    });
  });

  it('consumes a legacy fallback when its Beta 0.2 search_only entity is a polygon', () => {
    const searchOnlyPolygonCatalog: PublicCatalogSnapshotV2 = {
      ...beta02Catalog,
      entities: beta02Catalog.entities.map((entity) =>
        entity.id === 'place-harbor'
          ? {
              ...entity,
              visibility: 'search_only' as const,
              geometry: {
                kind: 'polygon' as const,
                vertices: [
                  { x: 50, y: 150 },
                  { x: 150, y: 150 },
                  { x: 150, y: 250 },
                  { x: 50, y: 250 },
                ],
              },
              coordinates: { x: 100, y: 200 },
            }
          : entity,
      ),
    };

    expect(
      createAtlasPinMarkerModels(legacyCatalog, searchOnlyPolygonCatalog).map(({ id }) => id),
    ).toEqual(['entity-hero']);
  });
});
