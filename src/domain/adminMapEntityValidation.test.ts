import { describe, expect, it } from 'vitest';

import {
  canPhysicallyDeleteMapEntity,
  createEmptyMapEntityDraft,
  detailToDraft,
  type AdminMapEntityDetail,
  type AdminMapEntityDraft,
  type AdminMapEntityReferences,
} from './adminMapEntities';
import { validateAdminMapEntityDraft } from './adminMapEntityValidation';
import { isMapCoordinateWithinBounds } from './mapCoordinates';

const references: AdminMapEntityReferences = {
  categories: [
    { id: 'category-people', name: 'People', publicationStatus: 'published' },
    { id: 'category-draft', name: 'Draft', publicationStatus: 'draft' },
  ],
  tags: [
    { id: 'notable', name: 'Notable', publicationStatus: 'published' },
    { id: 'draft-tag', name: 'Draft tag', publicationStatus: 'draft' },
  ],
  players: [
    {
      id: 'player-one',
      displayName: 'One',
      publicationStatus: 'published',
      accentColor: '#475569',
    },
    {
      id: 'player-two',
      displayName: 'Two',
      publicationStatus: 'published',
      accentColor: '#64748b',
    },
  ],
};

function draft(overrides: Partial<AdminMapEntityDraft> = {}): AdminMapEntityDraft {
  return {
    id: 'entity-map019',
    slug: 'map019',
    entityType: 'character',
    visibility: 'pin',
    name: 'MAP-019 Test',
    summary: '',
    description: '',
    x: 1800,
    y: 1200,
    categoryId: 'category-people',
    tagIds: ['notable'],
    dispositions: [
      { playerId: 'player-one', disposition: 'ally' },
      { playerId: 'player-two', disposition: 'neutral' },
    ],
    publicationStatus: 'draft',
    ...overrides,
  };
}

function detail(overrides: Partial<AdminMapEntityDetail['record']> = {}): AdminMapEntityDetail {
  return {
    record: {
      id: 'entity-map019',
      slug: 'map019',
      entityType: 'character',
      visibility: 'pin',
      name: 'MAP-019 Test',
      summary: '',
      description: '',
      x: 1800,
      y: 1200,
      categoryId: 'category-people',
      publicationStatus: 'draft',
      publishedAt: null,
      archivedAt: null,
      updatedAt: '2026-08-07T12:00:00.000Z',
      ...overrides,
    },
    tagLinks: [],
    dispositions: [],
    relationsRevision: 'revision',
    deleteBlockers: {
      aliases: 0,
      tags: 0,
      geographicNames: 0,
      notes: 0,
      locationEvents: 0,
      requests: 0,
    },
  };
}

describe('MAP-019 coordinate contract', () => {
  it('accepts the exact CRS.Simple image bounds and rejects invalid coordinates', () => {
    expect(isMapCoordinateWithinBounds({ x: 0, y: 0 })).toBe(true);
    expect(isMapCoordinateWithinBounds({ x: 3600, y: 2329 })).toBe(true);
    expect(isMapCoordinateWithinBounds({ x: 3600.01, y: 2329 })).toBe(false);
    expect(isMapCoordinateWithinBounds({ x: 1, y: Number.NaN })).toBe(false);
  });
});

describe('MAP-057 player relation contract', () => {
  it('initializes every new entity-player combination as neutral', () => {
    expect(createEmptyMapEntityDraft(references).dispositions).toEqual([
      { playerId: 'player-one', disposition: 'neutral' },
      { playerId: 'player-two', disposition: 'neutral' },
    ]);
  });

  it('preserves historical disposition values when reopening an entity', () => {
    const historical = detail();
    const reopened = detailToDraft({
      ...historical,
      dispositions: [
        {
          playerId: 'player-one',
          displayName: 'One',
          disposition: 'enemy',
          updatedAt: '2026-08-07T12:00:00.000Z',
        },
        {
          playerId: 'player-two',
          displayName: 'Two',
          disposition: 'ally',
          updatedAt: '2026-08-07T12:00:00.000Z',
        },
      ],
    });

    expect(reopened.dispositions).toEqual([
      { playerId: 'player-one', disposition: 'enemy' },
      { playerId: 'player-two', disposition: 'ally' },
    ]);
  });
});

describe('validateAdminMapEntityDraft', () => {
  it('allows a valid draft with draft relations without making them public', () => {
    const result = validateAdminMapEntityDraft(
      draft({ categoryId: 'category-draft', tagIds: ['draft-tag'] }),
      references,
    );
    expect(result).toEqual({ valid: true, fieldErrors: {} });
  });

  it('requires published category and tags before publication', () => {
    const result = validateAdminMapEntityDraft(
      draft({
        categoryId: 'category-draft',
        tagIds: ['draft-tag'],
        publicationStatus: 'published',
      }),
      references,
    );
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.categoryId).toMatch(/publicada/);
    expect(result.fieldErrors.tagIds).toMatch(/publicadas/);
  });

  it('rejects portraits on locations while allowing locations without one', () => {
    const withoutPortrait = validateAdminMapEntityDraft(
      draft({ entityType: 'location', portraitPath: null }),
      references,
    );
    expect(withoutPortrait.valid).toBe(true);

    const withPortrait = validateAdminMapEntityDraft(
      draft({
        entityType: 'location',
        portraitPath: 'portraits/123e4567-e89b-42d3-a456-426614174000.webp',
      }),
      references,
    );
    expect(withPortrait.fieldErrors.portraitPath).toMatch(/personajes/);
  });

  it('blocks out-of-bounds positions and stale player matrices', () => {
    const result = validateAdminMapEntityDraft(
      draft({
        x: -1,
        dispositions: [{ playerId: 'player-one', disposition: 'enemy' }],
      }),
      references,
    );
    expect(result.fieldErrors.coordinates).toMatch(/0–3600/);
    expect(result.fieldErrors.dispositions).toMatch(/Recarga/);
  });

  it('rejects incomplete or manipulated disposition values instead of inventing neutral', () => {
    const result = validateAdminMapEntityDraft(
      draft({
        dispositions: [
          {
            playerId: 'player-one',
            disposition: '' as AdminMapEntityDraft['dispositions'][number]['disposition'],
          },
          { playerId: 'player-two', disposition: 'enemy' },
        ],
      }),
      references,
    );

    expect(result.valid).toBe(false);
    expect(result.fieldErrors.dispositions).toMatch(/Aliado, Neutral o Enemigo/);
  });

  it('protects entity type, historical slug and archived-to-published transition', () => {
    const original = detail({
      publicationStatus: 'archived',
      publishedAt: '2026-08-07T10:00:00.000Z',
    });
    const result = validateAdminMapEntityDraft(
      draft({
        slug: 'changed',
        entityType: 'location',
        publicationStatus: 'published',
      }),
      references,
      original,
    );
    expect(result.fieldErrors.slug).toMatch(/primera publicación/);
    expect(result.fieldErrors.entityType).toMatch(/no puede cambiar/);
    expect(result.fieldErrors.publicationStatus).toMatch(/volver a borrador/);
  });
});

describe('physical deletion rule', () => {
  it('allows only never-published entities without model relations', () => {
    expect(canPhysicallyDeleteMapEntity(detail())).toBe(true);
    expect(canPhysicallyDeleteMapEntity(detail({ publishedAt: '2026-08-07T10:00:00.000Z' }))).toBe(
      false,
    );
    const referenced = detail();
    expect(
      canPhysicallyDeleteMapEntity({
        ...referenced,
        deleteBlockers: { ...referenced.deleteBlockers, tags: 1 },
      }),
    ).toBe(false);
  });
});
