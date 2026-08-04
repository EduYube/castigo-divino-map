import { describe, expect, it } from 'vitest';

import { campaignCatalog } from './catalog';
import type { CampaignCatalog } from './model';
import { normalizePlaceSearchQuery, searchPublicPlaces } from './search';

const rankingCatalog = {
  categories: [],
  tags: [],
  places: [
    {
      id: 'place-partial',
      slug: 'partial',
      name: 'La ruta Alpha del norte',
      aliases: ['Camino antiguo'],
      coordinates: { x: 0, y: 0 },
      categoryId: 'category-demo',
      tagIds: [],
    },
    {
      id: 'place-prefix',
      slug: 'prefix',
      name: 'Alpha del bosque',
      aliases: ['Entrada verde'],
      coordinates: { x: 0, y: 0 },
      categoryId: 'category-demo',
      tagIds: [],
    },
    {
      id: 'place-exact',
      slug: 'exact',
      name: 'Alpha',
      aliases: ['ALPHA', 'Nombre repetido'],
      coordinates: { x: 0, y: 0 },
      categoryId: 'category-demo',
      tagIds: [],
    },
  ],
  notes: [
    {
      id: 'note-exact-duplicate',
      slug: 'exact-duplicate',
      placeId: 'place-exact',
      title: 'Alpha',
      body: 'El cuerpo no interviene al elegir la coincidencia representativa.',
      tagIds: [],
    },
  ],
} as const satisfies CampaignCatalog;

describe('place search normalization', () => {
  it('ignores uppercase and lowercase differences', () => {
    expect(normalizePlaceSearchQuery('PUERTO')).toBe('puerto');
  });

  it('removes accents and other diacritics', () => {
    expect(normalizePlaceSearchQuery('Información pública')).toBe('informacion publica');
  });

  it('trims outer whitespace and collapses whitespace sequences', () => {
    expect(normalizePlaceSearchQuery('  Puerto   de\n ejemplo  ')).toBe('puerto de ejemplo');
  });
});

describe('public place search', () => {
  it('matches a primary place name without accents or matching case', () => {
    expect(searchPublicPlaces(campaignCatalog, 'PUERTO DE DEMOSTRACION')).toEqual([
      {
        placeId: 'place-demo-harbor',
        placeName: 'Puerto de demostración',
        matchKind: 'name',
        matchedText: 'Puerto de demostración',
        matchRank: 0,
      },
    ]);
  });

  it('matches an alias and keeps the associated place identity', () => {
    expect(searchPublicPlaces(campaignCatalog, 'puerto de ejemplo')).toEqual([
      {
        placeId: 'place-demo-harbor',
        placeName: 'Puerto de demostración',
        matchKind: 'alias',
        matchedText: 'Puerto de ejemplo',
        matchRank: 0,
      },
    ]);
  });

  it('matches a public note title and keeps the associated place identity', () => {
    expect(searchPublicPlaces(campaignCatalog, 'referencia publica de viaje')).toEqual([
      {
        placeId: 'place-demo-pass',
        placeName: 'Paso de demostración',
        matchKind: 'note-title',
        matchedText: 'Referencia pública de viaje',
        matchRank: 0,
      },
    ]);
  });

  it('does not index the body of public notes', () => {
    expect(searchPublicPlaces(campaignCatalog, 'puerto ficticio')).toEqual([]);
  });

  it('orders exact matches before prefix and partial matches', () => {
    expect(searchPublicPlaces(rankingCatalog, 'alpha').map(({ placeId }) => placeId)).toEqual([
      'place-exact',
      'place-prefix',
      'place-partial',
    ]);
  });

  it('uses stable catalog order to resolve matches with the same rank', () => {
    expect(searchPublicPlaces(rankingCatalog, 'del').map(({ placeId }) => placeId)).toEqual([
      'place-partial',
      'place-prefix',
    ]);
  });

  it('returns no results for an empty normalized query', () => {
    expect(searchPublicPlaces(campaignCatalog, ' \n ')).toEqual([]);
  });

  it('returns each place once and chooses the strongest stable source', () => {
    expect(searchPublicPlaces(rankingCatalog, 'alpha')).toContainEqual({
      placeId: 'place-exact',
      placeName: 'Alpha',
      matchKind: 'name',
      matchedText: 'Alpha',
      matchRank: 0,
    });
    expect(
      searchPublicPlaces(rankingCatalog, 'alpha').filter(
        ({ placeId }) => placeId === 'place-exact',
      ),
    ).toHaveLength(1);
  });
});
