import { describe, expect, it } from 'vitest';

import type { PublicCatalogSnapshotV2 } from './beta02-model';
import { resolveFullEntityDetail } from './fullEntityDetails';

const catalog = {
  schemaVersion: 2,
  generatedAt: '2026-08-08T09:30:00.000Z',
  sourceRevision: 'map-024-test',
  checksum: 'map-024-test-checksum',
  categories: [
    {
      id: 'category-settlement',
      slug: 'settlements',
      name: 'Asentamiento',
      description: 'Categoría pública.',
    },
  ],
  tags: [
    { id: 'coastal', name: 'Costero', description: 'Junto al mar.' },
    { id: 'watch', name: 'Vigilancia', description: 'Puesto vigilado.' },
  ],
  players: [
    { id: 'player-a', slug: 'alicia', displayName: 'Alicia', nameLanguage: 'en' },
    { id: 'player-b', slug: 'borin', displayName: 'Borin', nameLanguage: 'en' },
  ],
  entities: [
    {
      id: 'place-demo-harbor',
      slug: 'demo-harbor',
      entityType: 'location',
      visibility: 'pin',
      name: 'Demonstration Harbor',
      nameLanguage: 'en',
      aliases: [
        {
          id: 'alias-harbor',
          entityId: 'place-demo-harbor',
          language: 'en',
          value: '<Harbor Alias>',
        },
      ],
      summary: 'Resumen público.',
      description: '<script>Descripción literal</script>',
      coordinates: { x: 1080.5, y: 820 },
      categoryId: 'category-settlement',
      tagIds: ['coastal'],
    },
    {
      id: 'entity-harbor-guard',
      slug: 'harbor-guard',
      entityType: 'character',
      visibility: 'search_only',
      name: 'Harbor Guard',
      nameLanguage: 'en',
      aliases: [],
      summary: 'Guardia del puerto.',
      description: 'Descripción del personaje.',
      portraitPath: 'portraits/123e4567-e89b-42d3-a456-426614174000.webp',
      coordinates: { x: 1080.5, y: 820 },
      categoryId: 'category-settlement',
      tagIds: ['watch'],
    },
  ],
  dispositions: [
    { entityId: 'place-demo-harbor', playerId: 'player-a', disposition: 'ally' },
    { entityId: 'place-demo-harbor', playerId: 'player-b', disposition: 'neutral' },
    { entityId: 'entity-harbor-guard', playerId: 'player-a', disposition: 'enemy' },
    { entityId: 'entity-harbor-guard', playerId: 'player-b', disposition: 'neutral' },
  ],
  characterLocationRelations: [
    {
      characterId: 'entity-harbor-guard',
      locationId: 'place-demo-harbor',
      relationStatus: 'last-seen',
    },
  ],
  notes: [
    {
      id: 'note-harbor',
      slug: 'harbor-note',
      entityId: 'place-demo-harbor',
      title: '<b>Nota pública</b>',
      body: '<img src=x onerror=alert(1)>',
      sortOrder: 0,
      tagIds: ['watch'],
    },
  ],
  geographicNames: [
    {
      id: 'geo-harbor',
      slug: 'harbor-region',
      name: 'Harbor Region',
      language: 'en',
      aliases: [],
      coordinates: { x: 1090, y: 830 },
      recommendedZoom: 1,
      entityId: 'place-demo-harbor',
    },
  ],
  characterLocationEvents: [
    {
      id: 'location-event-guard-1',
      characterId: 'entity-harbor-guard',
      eventType: 'sighting',
      location: {
        locationEntityId: 'place-demo-harbor',
        geographicNameId: null,
        coordinates: null,
        locationLabel: null,
      },
      summary: 'Visto vigilando la entrada.',
      language: 'en',
      observedAt: '2026-08-07T20:00:00.000Z',
      relatedSightingId: null,
    },
    {
      id: 'location-event-guard-2',
      characterId: 'entity-harbor-guard',
      eventType: 'departure',
      location: {
        locationEntityId: null,
        geographicNameId: 'geo-harbor',
        coordinates: null,
        locationLabel: 'La costa',
      },
      summary: 'Abandonó el puesto.',
      language: 'en',
      observedAt: '2026-08-08T08:00:00.000Z',
      relatedSightingId: 'location-event-guard-1',
    },
  ],
} satisfies PublicCatalogSnapshotV2;

describe('full entity details', () => {
  it('resolves complete location content and real character relations', () => {
    const details = resolveFullEntityDetail(catalog, 'demo-harbor');

    expect(details).toMatchObject({
      id: 'place-demo-harbor',
      entityType: 'location',
      visibility: 'pin',
      name: 'Demonstration Harbor',
      aliases: ['<Harbor Alias>'],
      summary: 'Resumen público.',
      description: '<script>Descripción literal</script>',
      category: { name: 'Asentamiento', description: 'Categoría pública.' },
      tags: [{ name: 'Costero', description: 'Junto al mar.' }],
      dispositions: [
        { playerName: 'Alicia', disposition: 'ally' },
        { playerName: 'Borin', disposition: 'neutral' },
      ],
      notes: [
        {
          title: '<b>Nota pública</b>',
          body: '<img src=x onerror=alert(1)>',
          tags: [{ name: 'Vigilancia' }],
        },
      ],
      importantCharacters: [
        {
          slug: 'harbor-guard',
          name: 'Harbor Guard',
          relationStatus: 'last-seen',
          relationLabel: 'Visto por última vez',
        },
      ],
      relatedLocations: [],
      publicUpdatedAt: '2026-08-08T09:30:00.000Z',
    });
    expect(details?.locationHistory).toEqual([]);
  });

  it('resolves inverse character locations and chronological public history', () => {
    const details = resolveFullEntityDetail(catalog, 'harbor-guard');

    expect(details).toMatchObject({
      entityType: 'character',
      visibility: 'search_only',
      relatedLocations: [
        {
          slug: 'demo-harbor',
          name: 'Demonstration Harbor',
          relationStatus: 'last-seen',
          relationLabel: 'Visto por última vez',
        },
      ],
      importantCharacters: [],
      portraitPath: 'portraits/123e4567-e89b-42d3-a456-426614174000.webp',
    });
    expect(details?.locationHistory).toEqual([
      expect.objectContaining({
        id: 'location-event-guard-2',
        eventLabel: 'Salida',
        locationSlug: 'demo-harbor',
        locationName: 'Harbor Region',
        observedAt: '2026-08-08T08:00:00.000Z',
      }),
      expect.objectContaining({
        id: 'location-event-guard-1',
        eventLabel: 'Avistamiento',
        locationSlug: 'demo-harbor',
        locationName: 'Demonstration Harbor',
        observedAt: '2026-08-07T20:00:00.000Z',
      }),
    ]);
  });

  it('returns no public detail for an identity absent from the validated projection', () => {
    expect(resolveFullEntityDetail(catalog, 'draft-entity')).toBeUndefined();
    expect(resolveFullEntityDetail(catalog, 'missing-entity')).toBeUndefined();
  });

  it('fails closed when a public entity has no valid public category', () => {
    const incomplete = {
      ...catalog,
      categories: [],
    } satisfies PublicCatalogSnapshotV2;

    expect(resolveFullEntityDetail(incomplete, 'demo-harbor')).toBeUndefined();
  });
});
