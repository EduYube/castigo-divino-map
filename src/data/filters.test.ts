import { describe, expect, it } from 'vitest';

import type { CampaignCatalog } from './model';
import {
  deriveMatchingPublicPlaceIds,
  filterPublicPlaces,
  getPublicPlaceFilterTagIds,
  publicPlaceMatchesFilters,
  searchPublicPlaceIds,
  type PublicPlaceFilterState,
} from './filters';

const filterCatalog = {
  categories: [
    {
      id: 'category-settlement',
      slug: 'settlement',
      name: 'Settlement',
      description: 'Settlement category.',
    },
    {
      id: 'category-landmark',
      slug: 'landmark',
      name: 'Landmark',
      description: 'Landmark category.',
    },
    {
      id: 'category-unused',
      slug: 'unused',
      name: 'Unused',
      description: 'Unused category.',
    },
  ],
  tags: [
    { id: 'coastal', name: 'Coastal', description: 'Coastal tag.' },
    { id: 'trade', name: 'Trade', description: 'Trade tag.' },
    { id: 'note-only', name: 'Note only', description: 'Note-only tag.' },
    { id: 'unused', name: 'Unused', description: 'Unused tag.' },
  ],
  places: [
    {
      id: 'place-harbor',
      slug: 'harbor',
      name: 'Harbor Alpha',
      aliases: ['Alpha Port'],
      coordinates: { x: 1, y: 1 },
      categoryId: 'category-settlement',
      tagIds: ['coastal', 'trade'],
    },
    {
      id: 'place-market',
      slug: 'market',
      name: 'Market Beta',
      aliases: [],
      coordinates: { x: 2, y: 2 },
      categoryId: 'category-settlement',
      tagIds: ['trade'],
    },
    {
      id: 'place-pass',
      slug: 'pass',
      name: 'Mountain Pass',
      aliases: [],
      coordinates: { x: 3, y: 3 },
      categoryId: 'category-landmark',
      tagIds: [],
    },
  ],
  notes: [
    {
      id: 'note-pass-route',
      slug: 'pass-route',
      placeId: 'place-pass',
      title: 'Hidden road title',
      body: 'Public body.',
      tagIds: ['note-only', 'trade'],
    },
    {
      id: 'note-pass-duplicate',
      slug: 'pass-duplicate',
      placeId: 'place-pass',
      title: 'Second note',
      body: 'Public body.',
      tagIds: ['note-only'],
    },
  ],
} as const satisfies CampaignCatalog;

const noFilters: PublicPlaceFilterState = {
  selectedCategoryIds: [],
  selectedTagIds: [],
};

describe('public place filters', () => {
  it('matches every place when no filters are active', () => {
    expect(filterPublicPlaces(filterCatalog, noFilters)).toEqual([
      'place-harbor',
      'place-market',
      'place-pass',
    ]);
  });

  it('matches one selected category', () => {
    expect(
      filterPublicPlaces(filterCatalog, {
        selectedCategoryIds: ['category-landmark'],
        selectedTagIds: [],
      }),
    ).toEqual(['place-pass']);
  });

  it('combines multiple selected categories with OR', () => {
    expect(
      filterPublicPlaces(filterCatalog, {
        selectedCategoryIds: ['category-landmark', 'category-settlement'],
        selectedTagIds: [],
      }),
    ).toEqual(['place-harbor', 'place-market', 'place-pass']);
  });

  it('matches one selected tag', () => {
    expect(
      filterPublicPlaces(filterCatalog, {
        selectedCategoryIds: [],
        selectedTagIds: ['coastal'],
      }),
    ).toEqual(['place-harbor']);
  });

  it('combines multiple selected tags with OR', () => {
    expect(
      filterPublicPlaces(filterCatalog, {
        selectedCategoryIds: [],
        selectedTagIds: ['coastal', 'note-only'],
      }),
    ).toEqual(['place-harbor', 'place-pass']);
  });

  it('combines category and tag dimensions with AND', () => {
    expect(
      filterPublicPlaces(filterCatalog, {
        selectedCategoryIds: ['category-settlement'],
        selectedTagIds: ['trade'],
      }),
    ).toEqual(['place-harbor', 'place-market']);

    expect(
      filterPublicPlaces(filterCatalog, {
        selectedCategoryIds: ['category-landmark'],
        selectedTagIds: ['coastal'],
      }),
    ).toEqual([]);
  });

  it('includes tags from associated public notes without duplicates', () => {
    const pass = filterCatalog.places[2];

    expect(getPublicPlaceFilterTagIds(filterCatalog, pass)).toEqual(['trade', 'note-only']);
    expect(
      publicPlaceMatchesFilters(filterCatalog, pass, {
        selectedCategoryIds: [],
        selectedTagIds: ['note-only'],
      }),
    ).toBe(true);
  });

  it('keeps stable catalog order, place identity and no duplicates', () => {
    const result = filterPublicPlaces(filterCatalog, {
      selectedCategoryIds: [],
      selectedTagIds: ['trade', 'note-only'],
    });

    expect(result).toEqual(['place-harbor', 'place-market', 'place-pass']);
    expect(new Set(result).size).toBe(result.length);
  });

  it('does not mutate the catalog or input state', () => {
    const catalogSnapshot = JSON.parse(JSON.stringify(filterCatalog));
    const filters: PublicPlaceFilterState = {
      selectedCategoryIds: ['category-landmark'],
      selectedTagIds: ['note-only'],
    };
    const filterSnapshot = JSON.parse(JSON.stringify(filters));

    filterPublicPlaces(filterCatalog, filters);

    expect(filterCatalog).toEqual(catalogSnapshot);
    expect(filters).toEqual(filterSnapshot);
  });
});

describe('search and filter combination', () => {
  it('returns all places for an empty query', () => {
    expect(searchPublicPlaceIds(filterCatalog, '  ')).toEqual([
      'place-harbor',
      'place-market',
      'place-pass',
    ]);
  });

  it('uses the existing search algorithm for an active query', () => {
    expect(searchPublicPlaceIds(filterCatalog, 'alpha port')).toEqual(['place-harbor']);
    expect(searchPublicPlaceIds(filterCatalog, 'hidden road')).toEqual(['place-pass']);
  });

  it('combines an active entity query and filters with AND', () => {
    expect(
      deriveMatchingPublicPlaceIds(filterCatalog, 'market', {
        selectedCategoryIds: ['category-settlement'],
        selectedTagIds: ['trade'],
      }),
    ).toEqual(['place-market']);

    expect(
      deriveMatchingPublicPlaceIds(filterCatalog, 'market', {
        selectedCategoryIds: ['category-landmark'],
        selectedTagIds: [],
      }),
    ).toEqual([]);
  });

  it('ignores the textual query after a geographic result is selected', () => {
    expect(
      deriveMatchingPublicPlaceIds(filterCatalog, 'waterdeep', noFilters, {
        searchIntent: 'geographic-navigation',
      }),
    ).toEqual(['place-harbor', 'place-market', 'place-pass']);
  });

  it('keeps explicit filters active during geographic navigation', () => {
    expect(
      deriveMatchingPublicPlaceIds(
        filterCatalog,
        'waterdeep',
        {
          selectedCategoryIds: ['category-landmark'],
          selectedTagIds: ['note-only'],
        },
        { searchIntent: 'geographic-navigation' },
      ),
    ).toEqual(['place-pass']);
  });

  it('restores textual matching when geographic navigation is cleared', () => {
    expect(
      deriveMatchingPublicPlaceIds(filterCatalog, 'market', noFilters, {
        searchIntent: 'geographic-navigation',
      }),
    ).toEqual(['place-harbor', 'place-market', 'place-pass']);
    expect(deriveMatchingPublicPlaceIds(filterCatalog, 'market', noFilters)).toEqual([
      'place-market',
    ]);
  });

  it('does not restrict active filters when the query is empty', () => {
    expect(
      deriveMatchingPublicPlaceIds(filterCatalog, '', {
        selectedCategoryIds: ['category-landmark'],
        selectedTagIds: [],
      }),
    ).toEqual(['place-pass']);
  });

  it('does not restrict an active query when filters are empty', () => {
    expect(deriveMatchingPublicPlaceIds(filterCatalog, 'alpha', noFilters)).toEqual([
      'place-harbor',
    ]);
  });

  it('returns no places when no place satisfies every active dimension', () => {
    expect(
      deriveMatchingPublicPlaceIds(filterCatalog, 'harbor', {
        selectedCategoryIds: ['category-landmark'],
        selectedTagIds: ['note-only'],
      }),
    ).toEqual([]);
  });
});
