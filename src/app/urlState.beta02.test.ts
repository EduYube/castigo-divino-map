import { describe, expect, it } from 'vitest';

import type { PublicCatalogSnapshotV2 } from '../data/beta02-model';
import type { CampaignCatalog } from '../data/model';
import {
  EMPTY_PUBLIC_APP_URL_STATE,
  createCanonicalPublicAppUrl,
  normalizePublicAppUrlState,
  parsePublicAppUrlState,
} from './urlState';

const legacyCatalog = {
  categories: [
    {
      id: 'category-settlement',
      slug: 'asentamientos',
      name: 'Asentamiento',
      description: 'Categoría legacy.',
    },
  ],
  tags: [{ id: 'coastal', name: 'Costero', description: 'Etiqueta legacy.' }],
  places: [
    {
      id: 'place-demo-harbor',
      slug: 'puerto-de-demostracion',
      name: 'Puerto de demostración',
      aliases: [],
      coordinates: { x: 10, y: 20 },
      categoryId: 'category-settlement',
      tagIds: ['coastal'],
    },
  ],
  notes: [],
} as const satisfies CampaignCatalog;

const beta02Catalog = {
  schemaVersion: 2,
  generatedAt: '2026-08-14T00:00:00.000Z',
  sourceRevision: 'map-050-url-test',
  checksum: 'map-050-url-test',
  categories: [
    ...legacyCatalog.categories,
    {
      id: 'category-character',
      slug: 'personajes-beta02',
      name: 'Personajes Beta 0.2',
      description: 'Categoría pública añadida después de Beta 0.1.',
    },
    {
      id: 'category-unused',
      slug: 'taxonomia-sin-resultados',
      name: 'Taxonomía sin resultados',
      description: 'No debe exponerse en URL.',
    },
  ],
  tags: [
    ...legacyCatalog.tags,
    { id: 'beta02-only', name: 'Beta 0.2', description: 'Etiqueta pública nueva.' },
    { id: 'unused-beta02', name: 'Sin resultados', description: 'No debe exponerse.' },
  ],
  players: [],
  entities: [
    {
      id: 'place-demo-harbor',
      slug: 'puerto-de-demostracion',
      entityType: 'location',
      visibility: 'pin',
      name: 'Puerto de demostración',
      nameLanguage: 'en',
      aliases: [],
      summary: '',
      description: '',
      coordinates: { x: 10, y: 20 },
      categoryId: 'category-settlement',
      tagIds: ['coastal'],
    },
    {
      id: 'entity-beta02-character',
      slug: 'personaje-beta02',
      entityType: 'character',
      visibility: 'search_only',
      name: 'Personaje Beta 0.2',
      nameLanguage: 'en',
      aliases: [],
      summary: '',
      description: '',
      coordinates: { x: 30, y: 40 },
      categoryId: 'category-character',
      tagIds: ['beta02-only'],
    },
  ],
  dispositions: [],
  characterLocationRelations: [],
  notes: [],
  geographicNames: [],
  characterLocationEvents: [],
} as const satisfies PublicCatalogSnapshotV2;

const baseUrl = new URL('https://example.test/castigo-divino-map/');

describe('Beta 0.2 public filter URL state', () => {
  it('parses and canonicalizes category slugs and tag ids that do not exist in Beta 0.1', () => {
    const parsed = parsePublicAppUrlState(
      legacyCatalog,
      new URL(`${baseUrl.href}?category=personajes-beta02&tag=beta02-only`),
      beta02Catalog,
    );

    expect(parsed.state.selectedCategoryIds).toEqual(['category-character']);
    expect(parsed.state.selectedTagIds).toEqual(['beta02-only']);
    expect(parsed.canonicalUrl.search).toBe('?category=personajes-beta02&tag=beta02-only');
    expect(parsed.isCanonical).toBe(true);
  });

  it('round-trips a Beta 0.2-only selection across a reload', () => {
    const url = createCanonicalPublicAppUrl(
      legacyCatalog,
      baseUrl,
      {
        ...EMPTY_PUBLIC_APP_URL_STATE,
        selectedCategoryIds: ['category-character'],
        selectedTagIds: ['beta02-only'],
      },
      beta02Catalog,
    );

    expect(parsePublicAppUrlState(legacyCatalog, url, beta02Catalog).state).toEqual({
      ...EMPTY_PUBLIC_APP_URL_STATE,
      selectedCategoryIds: ['category-character'],
      selectedTagIds: ['beta02-only'],
    });
  });

  it('never serializes taxonomy entries without a public usable entity', () => {
    const normalized = normalizePublicAppUrlState(
      legacyCatalog,
      {
        ...EMPTY_PUBLIC_APP_URL_STATE,
        selectedCategoryIds: ['category-unused'],
        selectedTagIds: ['unused-beta02'],
      },
      beta02Catalog,
    );

    expect(normalized.selectedCategoryIds).toEqual([]);
    expect(normalized.selectedTagIds).toEqual([]);
    expect(
      createCanonicalPublicAppUrl(legacyCatalog, baseUrl, normalized, beta02Catalog).search,
    ).toBe('');
  });

  it('removes a selected facet and its URL parameter when its last public entity is revoked', () => {
    const revokedCatalog: PublicCatalogSnapshotV2 = {
      ...beta02Catalog,
      entities: beta02Catalog.entities.filter(({ id }) => id !== 'entity-beta02-character'),
    };
    const staleUrl = new URL(`${baseUrl.href}?category=personajes-beta02&tag=beta02-only`);
    const parsed = parsePublicAppUrlState(legacyCatalog, staleUrl, revokedCatalog);

    expect(parsed.state.selectedCategoryIds).toEqual([]);
    expect(parsed.state.selectedTagIds).toEqual([]);
    expect(parsed.canonicalUrl.href).toBe(baseUrl.href);
    expect(parsed.isCanonical).toBe(false);
  });

  it('fails closed for master-only-looking ids that are absent from the public snapshot', () => {
    const parsed = parsePublicAppUrlState(
      legacyCatalog,
      new URL(`${baseUrl.href}?category=category-master&tag=master-only`),
      beta02Catalog,
    );

    expect(parsed.state.selectedCategoryIds).toEqual([]);
    expect(parsed.state.selectedTagIds).toEqual([]);
    expect(parsed.canonicalUrl.href).toBe(baseUrl.href);
  });
});
