import { describe, expect, it } from 'vitest';

import type { AdminCategory, AdminGeographicName } from './adminCatalog';
import {
  normalizeAdminSearchText,
  resourceAllowsPhysicalDelete,
  validateAdminCatalogDraft,
} from './adminCatalogValidation';

const category: AdminCategory = {
  kind: 'category',
  id: 'category-cities',
  slug: 'cities',
  name: 'Cities',
  description: '',
  publicationStatus: 'published',
  publishedAt: '2026-08-07T10:00:00.000Z',
  updatedAt: '2026-08-07T10:00:00.000Z',
};

const geographicName: AdminGeographicName = {
  kind: 'geographic-name',
  id: 'geo-waterdeep',
  slug: 'waterdeep',
  name: 'Waterdeep',
  language: 'en',
  x: 1200,
  y: 800,
  recommendedZoom: 2,
  entityId: null,
  publicationStatus: 'published',
  publishedAt: '2026-08-07T10:00:00.000Z',
  updatedAt: '2026-08-07T10:00:00.000Z',
};

describe('normalizeAdminSearchText', () => {
  it('matches the PostgreSQL normalization contract for accents and punctuation', () => {
    expect(normalizeAdminSearchText('  Dagger—Falls, ÁREA!  ')).toBe('dagger falls area');
  });
});

describe('validateAdminCatalogDraft', () => {
  it('rejects invalid identifiers, slugs and unsupported languages immediately', () => {
    const invalidCategory = validateAdminCatalogDraft({
      kind: 'category',
      id: 'Category Bad',
      slug: 'Bad Slug',
      name: '',
      description: '',
      publicationStatus: 'draft',
    });
    expect(invalidCategory.valid).toBe(false);
    expect(invalidCategory.fieldErrors).toMatchObject({ id: expect.any(String), slug: expect.any(String), name: expect.any(String) });

    const invalidAlias = validateAdminCatalogDraft({
      kind: 'entity-alias',
      id: 'alias-test',
      entityId: 'entity-test',
      language: 'es' as 'en',
      value: 'Test',
      publicationStatus: 'draft',
    });
    expect(invalidAlias.fieldErrors.language).toContain('inglés');
  });

  it('validates coordinates and zoom for geographic names', () => {
    const result = validateAdminCatalogDraft({
      kind: 'geographic-name',
      id: 'geo-test',
      slug: 'test',
      name: 'Test',
      language: 'en',
      x: 3601,
      y: -1,
      recommendedZoom: 11,
      entityId: null,
      publicationStatus: 'draft',
    });

    expect(result.fieldErrors).toMatchObject({
      x: expect.any(String),
      y: expect.any(String),
      recommendedZoom: expect.any(String),
    });
  });

  it('prevents changing stable IDs and direct archived-to-published transitions', () => {
    const result = validateAdminCatalogDraft(
      {
        kind: 'category',
        id: 'category-renamed',
        slug: 'cities',
        name: 'Cities',
        description: '',
        publicationStatus: 'published',
      },
      {
        original: { ...category, publicationStatus: 'archived' },
      },
    );

    expect(result.fieldErrors.id).toContain('estable');
    expect(result.fieldErrors.publicationStatus).toContain('borrador');
  });

  it('detects equivalent published names before sending the request', () => {
    const result = validateAdminCatalogDraft(
      {
        kind: 'geographic-name',
        id: 'geo-waterdeep-two',
        slug: 'waterdeep-two',
        name: 'Wáterdeep!!!',
        language: 'en',
        x: 1,
        y: 1,
        recommendedZoom: null,
        entityId: null,
        publicationStatus: 'published',
      },
      { existing: [geographicName] },
    );

    expect(result.fieldErrors.name).toContain('equivalente');
  });
});

describe('resourceAllowsPhysicalDelete', () => {
  it('allows only never-published non-published rows', () => {
    expect(resourceAllowsPhysicalDelete(category)).toBe(false);
    expect(
      resourceAllowsPhysicalDelete({
        ...category,
        publicationStatus: 'draft',
        publishedAt: null,
      }),
    ).toBe(true);
  });
});
