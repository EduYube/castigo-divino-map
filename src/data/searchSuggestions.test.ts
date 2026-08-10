import { describe, expect, it } from 'vitest';

import type { PublicCatalogSnapshotV2 } from './beta02-model';
import type { CampaignCatalog } from './model';
import {
  DEFAULT_PUBLIC_SEARCH_SUGGESTION_LIMIT,
  getPublicAtlasSuggestions,
} from './searchSuggestions';

const category = {
  id: 'category-demo',
  slug: 'demo',
  name: 'Demo',
  description: '',
} as const;

const rankingCatalog = {
  categories: [category],
  tags: [],
  places: [
    {
      id: 'place-partial',
      slug: 'partial',
      name: 'Ruta Alpha del norte',
      aliases: [],
      coordinates: { x: 0, y: 0 },
      categoryId: category.id,
      tagIds: [],
    },
    {
      id: 'place-prefix',
      slug: 'prefix',
      name: 'Alpha del bosque',
      aliases: [],
      coordinates: { x: 1, y: 1 },
      categoryId: category.id,
      tagIds: [],
    },
    {
      id: 'place-exact',
      slug: 'exact',
      name: 'Alpha',
      aliases: ['Nombre alternativo'],
      coordinates: { x: 2, y: 2 },
      categoryId: category.id,
      tagIds: [],
    },
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `place-alpha-${index}`,
      slug: `alpha-${index}`,
      name: `Alpha ${index}`,
      aliases: [],
      coordinates: { x: index + 3, y: index + 3 },
      categoryId: category.id,
      tagIds: [],
    })),
  ],
  notes: [],
} satisfies CampaignCatalog;

const collisionCatalog = {
  schemaVersion: 2,
  generatedAt: '2026-08-10T00:00:00.000Z',
  sourceRevision: 'map-038-test',
  checksum: `sha256:${'0'.repeat(64)}`,
  categories: [category],
  tags: [],
  players: [],
  entities: [
    {
      id: 'entity-echo',
      slug: 'echo-character',
      entityType: 'character',
      visibility: 'search_only',
      name: 'Echo',
      nameLanguage: 'en',
      aliases: [],
      summary: '',
      description: '',
      coordinates: { x: 10, y: 10 },
      categoryId: category.id,
      tagIds: [],
    },
  ],
  dispositions: [],
  characterLocationRelations: [],
  notes: [],
  geographicNames: [
    {
      id: 'geo-echo',
      slug: 'echo',
      name: 'Echo',
      language: 'en',
      aliases: [
        {
          id: 'geo-echo-alias',
          geographicNameId: 'geo-echo',
          language: 'en',
          value: 'The Echo',
        },
      ],
      coordinates: { x: 11, y: 11 },
      recommendedZoom: 0.5,
      entityId: null,
    },
  ],
  characterLocationEvents: [],
} satisfies PublicCatalogSnapshotV2;

describe('public search suggestions', () => {
  it('reuses normalized exact, prefix and partial ranking', () => {
    expect(
      getPublicAtlasSuggestions(rankingCatalog, null, ' ÁLPHA ', 9).map(({ id }) => id),
    ).toEqual([
      'place-exact',
      'place-prefix',
      'place-alpha-0',
      'place-alpha-1',
      'place-alpha-2',
      'place-alpha-3',
      'place-alpha-4',
      'place-alpha-5',
      'place-partial',
    ]);
  });

  it('matches aliases while preserving the visible canonical name', () => {
    expect(getPublicAtlasSuggestions(rankingCatalog, null, 'alternativo', 3)).toEqual([
      expect.objectContaining({
        id: 'place-exact',
        name: 'Alpha',
        matchKind: 'alias',
        matchedText: 'Nombre alternativo',
      }),
    ]);
  });

  it('limits the visible suggestion set without changing ranking', () => {
    const suggestions = getPublicAtlasSuggestions(rankingCatalog, null, 'alpha');

    expect(suggestions).toHaveLength(DEFAULT_PUBLIC_SEARCH_SUGGESTION_LIMIT);
    expect(suggestions.map(({ id }) => id)).toEqual([
      'place-exact',
      'place-prefix',
      'place-alpha-0',
      'place-alpha-1',
      'place-alpha-2',
      'place-alpha-3',
    ]);
  });

  it('returns no suggestions for empty or unmatched queries', () => {
    expect(getPublicAtlasSuggestions(rankingCatalog, null, '   ')).toEqual([]);
    expect(getPublicAtlasSuggestions(rankingCatalog, null, 'zzzz')).toEqual([]);
  });

  it('keeps colliding visible names as distinct typed identities', () => {
    expect(
      getPublicAtlasSuggestions(
        { categories: [], tags: [], places: [], notes: [] },
        collisionCatalog,
        'echo',
      ).map(({ id, type, name }) => ({ id, type, name })),
    ).toEqual([
      { id: 'geo-echo', type: 'geographic', name: 'Echo' },
      { id: 'entity-echo', type: 'character', name: 'Echo' },
    ]);
  });

  it('accepts an alias from the Beta 0.2 geographic index', () => {
    expect(
      getPublicAtlasSuggestions(
        { categories: [], tags: [], places: [], notes: [] },
        collisionCatalog,
        'the echo',
      ),
    ).toEqual([
      expect.objectContaining({
        id: 'geo-echo',
        name: 'Echo',
        matchKind: 'alias',
      }),
    ]);
  });
});
