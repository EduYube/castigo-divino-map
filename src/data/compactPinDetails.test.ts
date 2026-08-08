import { describe, expect, it } from 'vitest';

import type { PublicCatalogSnapshotV2 } from './beta02-model';
import { campaignCatalog } from './catalog';
import { buildCompactPinDetailModel } from './compactPinDetails';
import { createAtlasPinMarkerModels } from './pinMarkers';

const beta02Catalog = {
  schemaVersion: 2,
  generatedAt: '2026-08-08T00:00:00.000Z',
  sourceRevision: 'map-023-test',
  checksum: 'map-023-test-checksum',
  categories: [
    {
      id: 'category-settlement',
      slug: 'asentamientos',
      name: 'Asentamiento Beta 0.2',
      description: 'Descripción extensa que no pertenece a la ficha compacta.',
    },
  ],
  tags: [
    { id: 'coastal', name: 'Costero', description: 'Descripción de tag no compacta.' },
    { id: 'demo-data', name: 'Dato de demostración', description: 'Descripción no compacta.' },
  ],
  players: [
    { id: 'player-a', slug: 'alicia', displayName: 'Alicia', nameLanguage: 'en' },
    { id: 'player-b', slug: 'borin', displayName: 'Borin', nameLanguage: 'en' },
  ],
  entities: [
    {
      id: 'place-demo-harbor',
      slug: 'puerto-de-demostracion',
      entityType: 'location',
      visibility: 'pin',
      name: 'Demonstration Harbor',
      nameLanguage: 'en',
      aliases: [],
      summary: 'Resumen que no pertenece a la ficha compacta.',
      description: 'Descripción larga que no pertenece a la ficha compacta.',
      coordinates: { x: 1080.5, y: 820 },
      categoryId: 'category-settlement',
      tagIds: ['coastal', 'demo-data'],
    },
    {
      id: 'entity-harbor-guard',
      slug: 'harbor-guard',
      entityType: 'character',
      visibility: 'pin',
      name: 'Harbor Guard',
      nameLanguage: 'en',
      aliases: [],
      summary: '',
      description: '',
      coordinates: { x: 1080.5, y: 820 },
      categoryId: 'category-settlement',
      tagIds: ['demo-data'],
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
      relationStatus: 'present',
    },
  ],
  notes: [
    {
      id: 'note-harbor',
      slug: 'harbor-note',
      entityId: 'place-demo-harbor',
      title: 'Nota que no debe aparecer',
      body: 'Cuerpo largo que no debe formar parte del modelo compacto.',
      sortOrder: 0,
      tagIds: [],
    },
  ],
  geographicNames: [],
  characterLocationEvents: [],
} satisfies PublicCatalogSnapshotV2;

describe('compact pin detail model', () => {
  it('builds a Beta 0.1 fallback with only compact classification data', () => {
    const marker = createAtlasPinMarkerModels(campaignCatalog, null)[0];
    const details = marker ? buildCompactPinDetailModel(campaignCatalog, null, marker) : undefined;

    expect(details).toMatchObject({
      id: 'place-demo-harbor',
      entityId: null,
      entityType: 'location',
      name: 'Puerto de demostración',
      category: { name: 'Asentamiento' },
      tags: [{ name: 'Costero' }, { name: 'Dato de demostración' }, { name: 'Ruta comercial' }],
      dispositions: [],
      importantCharacters: [],
      source: 'beta01',
    });
    expect(details).not.toHaveProperty('aliases');
    expect(details).not.toHaveProperty('description');
    expect(details).not.toHaveProperty('notes');
  });

  it('enriches a legacy location from Beta 0.2 and projects important characters once', () => {
    const marker = createAtlasPinMarkerModels(campaignCatalog, beta02Catalog).find(
      ({ id }) => id === 'place-demo-harbor',
    );
    const details = marker
      ? buildCompactPinDetailModel(campaignCatalog, beta02Catalog, marker)
      : undefined;

    expect(details).toMatchObject({
      entityId: 'place-demo-harbor',
      entityType: 'location',
      name: 'Demonstration Harbor',
      category: { name: 'Asentamiento Beta 0.2' },
      tags: [{ name: 'Costero' }, { name: 'Dato de demostración' }],
      dispositions: [
        { playerName: 'Alicia', disposition: 'ally' },
        { playerName: 'Borin', disposition: 'neutral' },
      ],
      importantCharacters: [
        {
          id: 'entity-harbor-guard',
          name: 'Harbor Guard',
          relationStatus: 'present',
          relationLabel: 'Presente',
        },
      ],
      source: 'beta02',
    });
  });

  it('uses the same compact model for a character without inventing inverse relation content', () => {
    const marker = createAtlasPinMarkerModels(campaignCatalog, beta02Catalog).find(
      ({ id }) => id === 'entity-harbor-guard',
    );
    const details = marker
      ? buildCompactPinDetailModel(campaignCatalog, beta02Catalog, marker)
      : undefined;

    expect(details).toMatchObject({
      entityType: 'character',
      name: 'Harbor Guard',
      category: { name: 'Asentamiento Beta 0.2' },
      tags: [{ name: 'Dato de demostración' }],
      importantCharacters: [],
      source: 'beta02',
    });
  });

  it('returns undefined for a supplemental pin when its Beta 0.2 entity is unavailable', () => {
    const marker = createAtlasPinMarkerModels(campaignCatalog, beta02Catalog).find(
      ({ id }) => id === 'entity-harbor-guard',
    );

    expect(
      marker ? buildCompactPinDetailModel(campaignCatalog, null, marker) : undefined,
    ).toBeUndefined();
  });
});
