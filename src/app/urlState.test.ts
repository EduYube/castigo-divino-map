import { describe, expect, it } from 'vitest';

import type { CampaignCatalog } from '../data/model';
import {
  EMPTY_PUBLIC_APP_URL_STATE,
  arePublicAppUrlStatesEqual,
  createCanonicalPublicAppUrl,
  normalizePublicAppUrlState,
  parsePublicAppUrlState,
  serializePublicAppUrlState,
  type PublicAppUrlState,
} from './urlState';

const urlCatalog = {
  categories: [
    {
      id: 'category-settlement',
      slug: 'asentamientos',
      name: 'Asentamiento',
      description: 'Categoría de asentamientos.',
    },
    {
      id: 'category-landmark',
      slug: 'lugares-destacados',
      name: 'Lugar destacado',
      description: 'Categoría de lugares destacados.',
    },
  ],
  tags: [
    { id: 'coastal', name: 'Costero', description: 'Etiqueta costera.' },
    { id: 'trade-route', name: 'Ruta comercial', description: 'Etiqueta comercial.' },
    { id: 'mountain-pass', name: 'Paso de montaña', description: 'Etiqueta montañosa.' },
  ],
  places: [
    {
      id: 'place-demo-harbor',
      slug: 'puerto-de-demostracion',
      name: 'Puerto de demostración',
      aliases: [],
      coordinates: { x: 10, y: 20 },
      categoryId: 'category-settlement',
      tagIds: ['coastal', 'trade-route'],
    },
    {
      id: 'place-demo-pass',
      slug: 'paso-de-demostracion',
      name: 'Paso de demostración',
      aliases: [],
      coordinates: { x: 30, y: 40 },
      categoryId: 'category-landmark',
      tagIds: ['mountain-pass'],
    },
  ],
  notes: [],
} as const satisfies CampaignCatalog;

const baseUrl = new URL('https://example.test/castigo-divino-map/');

function serialize(state: PublicAppUrlState): string {
  return serializePublicAppUrlState(urlCatalog, state).toString();
}

describe('public application URL state', () => {
  it('serializes a completely empty state without parameters', () => {
    expect(serialize(EMPTY_PUBLIC_APP_URL_STATE)).toBe('');
    expect(
      createCanonicalPublicAppUrl(urlCatalog, baseUrl, EMPTY_PUBLIC_APP_URL_STATE).href,
    ).toBe(baseUrl.href);
  });

  it('serializes only the active place using its stable slug', () => {
    expect(
      serialize({
        ...EMPTY_PUBLIC_APP_URL_STATE,
        activePlaceId: 'place-demo-harbor',
      }),
    ).toBe('place=puerto-de-demostracion');
  });

  it('serializes only the query', () => {
    expect(
      serialize({
        ...EMPTY_PUBLIC_APP_URL_STATE,
        query: 'Puerto público',
      }),
    ).toBe('q=Puerto+p%C3%BAblico');
  });

  it('serializes only categories in stable catalog order', () => {
    expect(
      serialize({
        ...EMPTY_PUBLIC_APP_URL_STATE,
        selectedCategoryIds: ['category-landmark', 'category-settlement'],
      }),
    ).toBe('category=asentamientos&category=lugares-destacados');
  });

  it('serializes only tags in stable catalog order', () => {
    expect(
      serialize({
        ...EMPTY_PUBLIC_APP_URL_STATE,
        selectedTagIds: ['mountain-pass', 'coastal'],
      }),
    ).toBe('tag=coastal&tag=mountain-pass');
  });

  it('serializes a complete state in canonical parameter order', () => {
    expect(
      serialize({
        activePlaceId: 'place-demo-pass',
        query: 'paso público',
        selectedCategoryIds: ['category-landmark'],
        selectedTagIds: ['trade-route', 'mountain-pass'],
      }),
    ).toBe(
      'place=paso-de-demostracion&q=paso+p%C3%BAblico&category=lugares-destacados&tag=trade-route&tag=mountain-pass',
    );
  });

  it('encodes spaces, accents and signs with URLSearchParams', () => {
    expect(
      serialize({
        ...EMPTY_PUBLIC_APP_URL_STATE,
        query: '  Árbol & dragón + torre?  ',
      }),
    ).toBe('q=%C3%81rbol+%26+drag%C3%B3n+%2B+torre%3F');
  });

  it('deduplicates and orders repeated categories and tags', () => {
    expect(
      normalizePublicAppUrlState(urlCatalog, {
        ...EMPTY_PUBLIC_APP_URL_STATE,
        selectedCategoryIds: [
          'category-landmark',
          'category-settlement',
          'category-landmark',
        ],
        selectedTagIds: ['mountain-pass', 'coastal', 'mountain-pass'],
      }),
    ).toEqual({
      activePlaceId: null,
      query: '',
      selectedCategoryIds: ['category-settlement', 'category-landmark'],
      selectedTagIds: ['coastal', 'mountain-pass'],
    });
  });

  it('ignores an invalid place without affecting the remaining state', () => {
    const parsed = parsePublicAppUrlState(
      urlCatalog,
      new URL(`${baseUrl.href}?place=desconocido&q=puerto&tag=coastal`),
    );

    expect(parsed.state).toEqual({
      activePlaceId: null,
      query: 'puerto',
      selectedCategoryIds: [],
      selectedTagIds: ['coastal'],
    });
  });

  it('ignores invalid categories and tags while preserving valid values', () => {
    const parsed = parsePublicAppUrlState(
      urlCatalog,
      new URL(
        `${baseUrl.href}?category=desconocida&category=asentamientos&tag=unknown&tag=mountain-pass`,
      ),
    );

    expect(parsed.state.selectedCategoryIds).toEqual(['category-settlement']);
    expect(parsed.state.selectedTagIds).toEqual(['mountain-pass']);
  });

  it('uses a later valid place when an earlier repeated value is invalid', () => {
    const parsed = parsePublicAppUrlState(
      urlCatalog,
      new URL(
        `${baseUrl.href}?place=desconocido&place=puerto-de-demostracion&place=paso-de-demostracion`,
      ),
    );

    expect(parsed.state.activePlaceId).toBe('place-demo-harbor');
    expect(parsed.canonicalUrl.search).toBe('?place=puerto-de-demostracion');
  });

  it('normalizes empty values and removes unknown parameters', () => {
    const parsed = parsePublicAppUrlState(
      urlCatalog,
      new URL(`${baseUrl.href}?q=+++&category=&tag=&external=value#section`),
    );

    expect(parsed.state).toEqual(EMPTY_PUBLIC_APP_URL_STATE);
    expect(parsed.canonicalUrl.href).toBe(baseUrl.href);
    expect(parsed.isCanonical).toBe(false);
  });

  it('canonicalizes valid but disordered and duplicated values', () => {
    const parsed = parsePublicAppUrlState(
      urlCatalog,
      new URL(
        `${baseUrl.href}?tag=mountain-pass&category=lugares-destacados&tag=coastal&category=asentamientos&tag=coastal`,
      ),
    );

    expect(parsed.canonicalUrl.search).toBe(
      '?category=asentamientos&category=lugares-destacados&tag=coastal&tag=mountain-pass',
    );
    expect(parsed.isCanonical).toBe(false);
  });

  it('accepts stable IDs and canonicalizes them to public slugs where available', () => {
    const parsed = parsePublicAppUrlState(
      urlCatalog,
      new URL(
        `${baseUrl.href}?place=place-demo-pass&category=category-landmark&tag=trade-route`,
      ),
    );

    expect(parsed.state.activePlaceId).toBe('place-demo-pass');
    expect(parsed.canonicalUrl.search).toBe(
      '?place=paso-de-demostracion&category=lugares-destacados&tag=trade-route',
    );
  });

  it('round-trips a complete state', () => {
    const state: PublicAppUrlState = {
      activePlaceId: 'place-demo-harbor',
      query: 'Puerto & costa',
      selectedCategoryIds: ['category-settlement'],
      selectedTagIds: ['coastal', 'trade-route'],
    };
    const url = createCanonicalPublicAppUrl(urlCatalog, baseUrl, state);

    expect(parsePublicAppUrlState(urlCatalog, url).state).toEqual(state);
    expect(parsePublicAppUrlState(urlCatalog, url).isCanonical).toBe(true);
  });

  it('does not mutate the catalog or input state', () => {
    const catalogSnapshot = JSON.parse(JSON.stringify(urlCatalog));
    const state: PublicAppUrlState = {
      activePlaceId: 'place-demo-pass',
      query: '  paso  ',
      selectedCategoryIds: ['category-landmark', 'category-landmark'],
      selectedTagIds: ['mountain-pass', 'mountain-pass'],
    };
    const stateSnapshot = JSON.parse(JSON.stringify(state));

    createCanonicalPublicAppUrl(urlCatalog, baseUrl, state);

    expect(urlCatalog).toEqual(catalogSnapshot);
    expect(state).toEqual(stateSnapshot);
  });

  it('compares normalized states without depending on input order or duplicates', () => {
    expect(
      arePublicAppUrlStatesEqual(
        urlCatalog,
        {
          activePlaceId: 'place-demo-harbor',
          query: ' puerto ',
          selectedCategoryIds: ['category-settlement'],
          selectedTagIds: ['trade-route', 'coastal', 'coastal'],
        },
        {
          activePlaceId: 'place-demo-harbor',
          query: 'puerto',
          selectedCategoryIds: ['category-settlement'],
          selectedTagIds: ['coastal', 'trade-route'],
        },
      ),
    ).toBe(true);
  });

  it('handles malformed percent encoding without throwing', () => {
    const malformedUrl = new URL(`${baseUrl.href}?q=%E0%A4%A&tag=coastal`);

    expect(() => parsePublicAppUrlState(urlCatalog, malformedUrl)).not.toThrow();
    expect(parsePublicAppUrlState(urlCatalog, malformedUrl).state.selectedTagIds).toEqual([
      'coastal',
    ]);
  });
});
