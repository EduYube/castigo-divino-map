import { describe, expect, it } from 'vitest';

import type { PublicCatalogSnapshotV2 } from './beta02-model';
import type { CampaignCatalog } from './model';
import {
  deriveMatchingPublicEntityIds,
  deriveMatchingPublicPlaceIds,
  derivePublicFilterFacets,
  filterPublicEntities,
  filterPublicPlaces,
  getPublicEntityFilterTagIds,
  getPublicPlaceFilterTagIds,
  publicEntityMatchesFilters,
  publicPlaceMatchesFilters,
  searchPublicEntityIds,
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

const beta02FilterCatalog = {
  schemaVersion: 2,
  generatedAt: '2026-08-14T00:00:00.000Z',
  sourceRevision: 'map-050-test',
  checksum: 'map-050-test',
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
      id: 'category-character',
      slug: 'characters',
      name: 'Characters',
      description: 'Character category.',
    },
    {
      id: 'category-unused',
      slug: 'unused-beta02',
      name: 'Unused Beta 0.2',
      description: 'Must not become a public facet.',
    },
  ],
  tags: [
    { id: 'coastal', name: 'Coastal', description: 'Coastal tag.' },
    { id: 'trade', name: 'Trade', description: 'Trade tag.' },
    { id: 'note-only', name: 'Note only', description: 'Note-only tag.' },
    { id: 'archive', name: 'Archive', description: 'Archive tag.' },
    { id: 'unused-beta02', name: 'Unused Beta 0.2', description: 'Must stay hidden.' },
  ],
  players: [],
  entities: [
    {
      id: 'place-harbor',
      slug: 'harbor',
      entityType: 'location',
      visibility: 'pin',
      name: 'Harbor Alpha',
      nameLanguage: 'en',
      aliases: [],
      summary: 'Public harbor.',
      description: 'Public harbor description.',
      coordinates: { x: 1, y: 1 },
      categoryId: 'category-settlement',
      tagIds: ['coastal', 'trade'],
    },
    {
      id: 'place-pass',
      slug: 'pass',
      entityType: 'location',
      visibility: 'pin',
      name: 'Mountain Pass',
      nameLanguage: 'en',
      aliases: [],
      summary: 'Public pass.',
      description: 'Public pass description.',
      coordinates: { x: 3, y: 3 },
      categoryId: 'category-landmark',
      tagIds: [],
    },
    {
      id: 'entity-guide',
      slug: 'guide',
      entityType: 'character',
      visibility: 'pin',
      name: 'Guide Gamma',
      nameLanguage: 'en',
      aliases: [],
      summary: 'Public guide.',
      description: 'Public guide description.',
      coordinates: { x: 4, y: 4 },
      categoryId: 'category-character',
      tagIds: ['trade'],
    },
    {
      id: 'entity-archivist',
      slug: 'archivist',
      entityType: 'character',
      visibility: 'search_only',
      name: 'Hidden Archivist',
      nameLanguage: 'en',
      aliases: [],
      summary: 'Searchable public archivist.',
      description: 'No permanent pin.',
      coordinates: { x: 5, y: 5 },
      categoryId: 'category-character',
      tagIds: ['archive'],
    },
  ],
  dispositions: [],
  characterLocationRelations: [],
  notes: [
    {
      id: 'note-pass-route',
      slug: 'pass-route',
      entityId: 'place-pass',
      title: 'Pass route',
      body: 'Public body.',
      sortOrder: 0,
      tagIds: ['note-only'],
    },
    {
      id: 'note-guide-route',
      slug: 'guide-route',
      entityId: 'entity-guide',
      title: 'Guide route',
      body: 'Public body.',
      sortOrder: 0,
      tagIds: ['note-only', 'trade'],
    },
  ],
  geographicNames: [],
  characterLocationEvents: [],
} as const satisfies PublicCatalogSnapshotV2;

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

describe('Beta 0.2 public entity filters', () => {
  it('derives only categories and tags associated with at least one public entity', () => {
    expect(derivePublicFilterFacets(beta02FilterCatalog)).toEqual({
      categories: [
        { ...beta02FilterCatalog.categories[0], count: 1 },
        { ...beta02FilterCatalog.categories[1], count: 1 },
        { ...beta02FilterCatalog.categories[2], count: 2 },
      ],
      tags: [
        { ...beta02FilterCatalog.tags[0], count: 1 },
        { ...beta02FilterCatalog.tags[1], count: 2 },
        { ...beta02FilterCatalog.tags[2], count: 2 },
        { ...beta02FilterCatalog.tags[3], count: 1 },
      ],
    });
  });

  it('counts search_only entities as public filter results without inventing a pin', () => {
    expect(
      filterPublicEntities(beta02FilterCatalog, {
        selectedCategoryIds: ['category-character'],
        selectedTagIds: ['archive'],
      }),
    ).toEqual(['entity-archivist']);
  });

  it('combines categories with OR, tags with OR and both dimensions with AND', () => {
    expect(
      filterPublicEntities(beta02FilterCatalog, {
        selectedCategoryIds: ['category-landmark', 'category-character'],
        selectedTagIds: [],
      }),
    ).toEqual(['place-pass', 'entity-guide', 'entity-archivist']);

    expect(
      filterPublicEntities(beta02FilterCatalog, {
        selectedCategoryIds: [],
        selectedTagIds: ['coastal', 'archive'],
      }),
    ).toEqual(['place-harbor', 'entity-archivist']);

    expect(
      filterPublicEntities(beta02FilterCatalog, {
        selectedCategoryIds: ['category-character'],
        selectedTagIds: ['trade', 'archive'],
      }),
    ).toEqual(['entity-guide', 'entity-archivist']);
  });

  it('includes public note tags for locations and characters without double-counting', () => {
    const guide = beta02FilterCatalog.entities[2];
    const pass = beta02FilterCatalog.entities[1];

    expect(getPublicEntityFilterTagIds(beta02FilterCatalog, guide)).toEqual(['trade', 'note-only']);
    expect(getPublicEntityFilterTagIds(beta02FilterCatalog, pass)).toEqual(['note-only']);
    expect(
      publicEntityMatchesFilters(beta02FilterCatalog, guide, {
        selectedCategoryIds: [],
        selectedTagIds: ['note-only'],
      }),
    ).toBe(true);
  });

  it('combines Beta 0.2 entity search and facets while preserving search_only results', () => {
    expect(searchPublicEntityIds(filterCatalog, beta02FilterCatalog, 'archivist')).toEqual([
      'entity-archivist',
    ]);
    expect(
      deriveMatchingPublicEntityIds(filterCatalog, beta02FilterCatalog, 'archivist', {
        selectedCategoryIds: ['category-character'],
        selectedTagIds: ['archive'],
      }),
    ).toEqual(['entity-archivist']);
    expect(
      deriveMatchingPublicEntityIds(filterCatalog, beta02FilterCatalog, 'archivist', {
        selectedCategoryIds: ['category-landmark'],
        selectedTagIds: [],
      }),
    ).toEqual([]);
  });

  it('ignores the text query during geographic navigation while keeping explicit facets', () => {
    expect(
      deriveMatchingPublicEntityIds(
        filterCatalog,
        beta02FilterCatalog,
        'waterdeep',
        {
          selectedCategoryIds: ['category-character'],
          selectedTagIds: ['archive'],
        },
        { searchIntent: 'geographic-navigation' },
      ),
    ).toEqual(['entity-archivist']);
  });

  it('fails closed for unknown/private facet ids', () => {
    expect(
      filterPublicEntities(beta02FilterCatalog, {
        selectedCategoryIds: ['category-master-only'],
        selectedTagIds: [],
      }),
    ).toEqual([]);
    expect(
      filterPublicEntities(beta02FilterCatalog, {
        selectedCategoryIds: [],
        selectedTagIds: ['master-only-tag'],
      }),
    ).toEqual([]);
  });

  it('removes facets automatically when their last public entity is revoked', () => {
    const revokedCatalog: PublicCatalogSnapshotV2 = {
      ...beta02FilterCatalog,
      entities: beta02FilterCatalog.entities.filter(({ id }) => id !== 'entity-archivist'),
    };
    const facets = derivePublicFilterFacets(revokedCatalog);

    expect(facets.categories.find(({ id }) => id === 'category-character')?.count).toBe(1);
    expect(facets.tags.some(({ id }) => id === 'archive')).toBe(false);
    expect(
      deriveMatchingPublicEntityIds(filterCatalog, revokedCatalog, '', {
        selectedCategoryIds: [],
        selectedTagIds: ['archive'],
      }),
    ).toEqual([]);
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
