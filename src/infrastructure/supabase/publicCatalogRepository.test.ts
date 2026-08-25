import { describe, expect, test } from 'vitest';

import { INITIAL_PUBLIC_CAMPAIGN_ID } from '../../data-access/publicCatalogQueryContract.js';
import { SupabasePublicCatalogRepository } from './publicCatalogRepository';

const PROJECT_URL = 'https://map016-test.supabase.co';
const LOCAL_PROJECT_URL = 'http://127.0.0.1:54321';
const PUBLISHABLE_KEY = 'sb_publishable_map016_test_key';
const LEGACY_ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature';
const LEGACY_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature';
const CAMPAIGN_B_ID = '00000000-0000-4000-8000-000000000054';
const GLOBAL_TABLES = new Set(['geographic_names', 'geographic_name_aliases']);

function jsonResponse(
  value: unknown,
  options: { readonly status?: number; readonly start?: number; readonly total?: number } = {},
): Response {
  const rows = Array.isArray(value) ? value : [];
  const total = options.total ?? rows.length;
  const start = options.start ?? 0;
  const contentRange =
    total === 0 ? '*/0' : `${start}-${start + Math.max(0, rows.length - 1)}/${total}`;

  return new Response(JSON.stringify(value), {
    status: options.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Range': contentRange,
    },
  });
}

function rangeStart(request: Request): number {
  const range = request.headers.get('range');
  const match = /^(\d+)-(\d+)$/.exec(range ?? '');

  if (!match) {
    throw new Error(`Missing or invalid Range header: ${range}`);
  }

  return Number(match[1]);
}

function tableName(url: URL): string {
  return url.pathname.split('/').at(-1) ?? '';
}

function expectCampaignScope(url: URL, campaignId = INITIAL_PUBLIC_CAMPAIGN_ID): void {
  if (GLOBAL_TABLES.has(tableName(url))) {
    expect(url.searchParams.has('campaign_id')).toBe(false);
  } else {
    expect(url.searchParams.get('campaign_id')).toBe(`eq.${campaignId}`);
  }
}

describe('SupabasePublicCatalogRepository', () => {
  test('loads the complete initial-campaign projection using only the apikey header', async () => {
    const requests: Request[] = [];
    const repository = new SupabasePublicCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async (input, init) => {
        requests.push(new Request(input, init));
        return jsonResponse([]);
      },
      now: () => Date.parse('2026-08-06T00:00:00.000Z'),
    });

    const result = await repository.load({ signal: new AbortController().signal });

    expect(result.source).toBe('supabase');
    expect(result.data.contract).toBe('beta02');
    expect(requests).toHaveLength(14);
    requests.forEach((request) => {
      expect(request.headers.get('apikey')).toBe(PUBLISHABLE_KEY);
      expect(request.headers.get('prefer')).toBe('count=exact');
      expect(request.headers.get('range-unit')).toBe('items');
      expect(request.headers.get('range')).toBe('0-999');
      expect(request.headers.has('authorization')).toBe(false);
      expectCampaignScope(new URL(request.url));
    });
    const relationRequest = requests.find((request) =>
      new URL(request.url).pathname.endsWith('/character_location_relations'),
    );
    expect(new URL(relationRequest?.url ?? '').searchParams.get('select')).toBe(
      'character_id,location_id,relation_status',
    );
  });

  test('uses explicit publication filters except where RLS owns the public predicate', async () => {
    const urls: URL[] = [];
    const repository = new SupabasePublicCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async (input) => {
        urls.push(new URL(String(input)));
        return jsonResponse([]);
      },
    });

    await repository.load({ signal: new AbortController().signal });

    const rlsOnlyTables = new Set([
      'entity_player_dispositions',
      'character_location_relations',
      'campaign_geographic_entity_links',
    ]);
    urls.forEach((url) => {
      if (rlsOnlyTables.has(tableName(url))) {
        expect(url.searchParams.has('publication_status')).toBe(false);
      } else {
        expect(url.searchParams.get('publication_status')).toBe('eq.published');
      }
    });
  });

  test('can target another campaign without scoping the global geographic index', async () => {
    const urls: URL[] = [];
    const repository = new SupabasePublicCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      campaignId: CAMPAIGN_B_ID,
      fetchImplementation: async (input) => {
        urls.push(new URL(String(input)));
        return jsonResponse([]);
      },
    });

    await repository.load({ signal: new AbortController().signal });

    expect(urls).toHaveLength(14);
    urls.forEach((url) => expectCampaignScope(url, CAMPAIGN_B_ID));
  });

  test('rehydrates the selected campaign geographic link over global geography', async () => {
    const rowsByTable: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
      categories: [{ id: 'category-places', slug: 'places', name: 'Places', description: '' }],
      tags: [],
      players: [],
      map_entities: [
        {
          id: 'entity-location',
          slug: 'location',
          entity_type: 'location',
          visibility: 'pin',
          name: 'Location',
          name_language: 'en',
          summary: '',
          description: '',
          x: 30,
          y: 40,
          category_id: 'category-places',
        },
      ],
      entity_aliases: [],
      entity_tags: [],
      entity_player_dispositions: [],
      character_location_relations: [],
      public_notes: [],
      public_note_tags: [],
      geographic_names: [
        {
          id: 'geo-location',
          slug: 'location',
          name: 'Location',
          language: 'en',
          x: 30,
          y: 40,
          recommended_zoom: 1,
          entity_id: null,
          search_min_x: null,
          search_max_x: null,
          search_min_y: null,
          search_max_y: null,
        },
      ],
      geographic_name_aliases: [],
      character_location_events: [],
      campaign_geographic_entity_links: [
        {
          campaign_id: INITIAL_PUBLIC_CAMPAIGN_ID,
          geographic_name_id: 'geo-location',
          entity_id: 'entity-location',
        },
      ],
    };
    const repository = new SupabasePublicCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async (input) => {
        const table = tableName(new URL(String(input)));
        return jsonResponse(rowsByTable[table] ?? []);
      },
    });

    const result = await repository.load({ signal: new AbortController().signal });
    if (result.data.contract !== 'beta02') throw new Error('Expected Beta 0.2 projection.');

    expect(result.data.catalog.geographicNames).toHaveLength(1);
    expect(result.data.catalog.geographicNames[0]?.entityId).toBe('entity-location');
  });

  test('rejects a geographic association that does not belong to the selected campaign', async () => {
    const repository = new SupabasePublicCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async (input) => {
        if (tableName(new URL(String(input))) === 'campaign_geographic_entity_links') {
          return jsonResponse([
            {
              campaign_id: CAMPAIGN_B_ID,
              geographic_name_id: 'geo-location',
              entity_id: 'entity-location',
            },
          ]);
        }
        return jsonResponse([]);
      },
    });

    await expect(repository.load({ signal: new AbortController().signal })).rejects.toMatchObject({
      code: 'invalid-response',
    });
  });

  test('parses a safe character-location relation and validates both public endpoints', async () => {
    const rowsByTable: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
      categories: [
        { id: 'category-people', slug: 'people', name: 'People', description: '' },
        { id: 'category-places', slug: 'places', name: 'Places', description: '' },
      ],
      tags: [],
      players: [],
      map_entities: [
        {
          id: 'entity-character',
          slug: 'character',
          entity_type: 'character',
          visibility: 'pin',
          name: 'Character',
          name_language: 'en',
          summary: '',
          description: '',
          x: 10,
          y: 20,
          category_id: 'category-people',
        },
        {
          id: 'entity-location',
          slug: 'location',
          entity_type: 'location',
          visibility: 'pin',
          name: 'Location',
          name_language: 'en',
          summary: '',
          description: '',
          x: 30,
          y: 40,
          category_id: 'category-places',
        },
      ],
      entity_aliases: [],
      entity_tags: [],
      entity_player_dispositions: [],
      character_location_relations: [
        {
          character_id: 'entity-character',
          location_id: 'entity-location',
          relation_status: 'present',
        },
      ],
      public_notes: [],
      public_note_tags: [],
      geographic_names: [],
      geographic_name_aliases: [],
      character_location_events: [],
      campaign_geographic_entity_links: [],
    };
    const repository = new SupabasePublicCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async (input) => {
        const table = tableName(new URL(String(input)));
        return jsonResponse(rowsByTable[table] ?? []);
      },
    });

    const result = await repository.load({ signal: new AbortController().signal });
    if (result.data.contract !== 'beta02') {
      throw new Error('Expected Beta 0.2 projection.');
    }
    expect(result.data.catalog.characterLocationRelations).toEqual([
      {
        characterId: 'entity-character',
        locationId: 'entity-location',
        relationStatus: 'present',
      },
    ]);
  });

  test('paginates and verifies a projection with more than one thousand dispositions', async () => {
    const categoryRows = [
      {
        id: 'category-location',
        slug: 'locations',
        name: 'Locations',
        description: '',
      },
    ];
    const playerRows = Array.from({ length: 6 }, (_, index) => ({
      id: `player-${index + 1}`,
      slug: `player-${index + 1}`,
      display_name: `Player ${index + 1}`,
      name_language: 'en',
    }));
    const entityRows = Array.from({ length: 200 }, (_, index) => {
      const suffix = String(index + 1).padStart(3, '0');

      return {
        id: `entity-${suffix}`,
        slug: `entity-${suffix}`,
        entity_type: 'character',
        visibility: 'search_only',
        name: `Entity ${suffix}`,
        name_language: 'en',
        summary: '',
        description: '',
        x: 100,
        y: 100,
        category_id: 'category-location',
      };
    });
    const dispositionRows = entityRows.flatMap((entity) =>
      playerRows.map((player) => ({
        entity_id: entity.id,
        player_id: player.id,
        disposition: 'neutral',
      })),
    );
    const rowsByTable: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
      categories: categoryRows,
      tags: [],
      players: playerRows,
      map_entities: entityRows,
      entity_aliases: [],
      entity_tags: [],
      entity_player_dispositions: dispositionRows,
      character_location_relations: [],
      public_notes: [],
      public_note_tags: [],
      geographic_names: [],
      geographic_name_aliases: [],
      character_location_events: [],
      campaign_geographic_entity_links: [],
    };
    const dispositionRequests: Request[] = [];
    const repository = new SupabasePublicCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async (input, init) => {
        const request = new Request(input, init);
        const table = tableName(new URL(request.url));
        const allRows = rowsByTable[table] ?? [];
        const start = rangeStart(request);
        const pageRows = allRows.slice(start, start + 1000);

        if (table === 'entity_player_dispositions') {
          dispositionRequests.push(request);
        }

        return jsonResponse(pageRows, { start, total: allRows.length });
      },
    });

    const result = await repository.load({ signal: new AbortController().signal });

    expect(result.data.contract).toBe('beta02');
    if (result.data.contract !== 'beta02') {
      throw new Error('Expected Beta 0.2 projection.');
    }
    expect(result.data.catalog.dispositions).toHaveLength(1200);
    expect(dispositionRequests.map((request) => request.headers.get('range'))).toEqual([
      '0-999',
      '1000-1999',
    ]);
  });

  test('rejects a successful response when Supabase does not confirm Content-Range', async () => {
    const repository = new SupabasePublicCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async () =>
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    });

    await expect(repository.load({ signal: new AbortController().signal })).rejects.toMatchObject({
      code: 'partial-response',
    });
  });

  test('aborts the rest of the table batch when one table fails', async () => {
    let pendingRequests = 0;
    let abortedRequests = 0;
    const repository = new SupabasePublicCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async (input, init) => {
        const request = new Request(input, init);

        if (new URL(request.url).pathname.endsWith('/categories')) {
          return new Response('temporary failure', { status: 503 });
        }

        pendingRequests += 1;

        return await new Promise<Response>((_resolve, reject) => {
          const signal = request.signal;
          const handleAbort = (): void => {
            abortedRequests += 1;
            reject(new DOMException('Aborted', 'AbortError'));
          };

          if (signal.aborted) {
            handleAbort();
            return;
          }

          signal.addEventListener('abort', handleAbort, { once: true });
        });
      },
    });

    await expect(repository.load({ signal: new AbortController().signal })).rejects.toMatchObject({
      code: 'http-error',
      status: 503,
    });
    expect(pendingRequests).toBe(13);
    expect(abortedRequests).toBe(13);
  });

  test('normalizes an HTTP failure without exposing the response body', async () => {
    const repository = new SupabasePublicCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async () => new Response('sensitive body', { status: 503 }),
    });

    await expect(repository.load({ signal: new AbortController().signal })).rejects.toMatchObject({
      code: 'http-error',
      status: 503,
    });
  });

  test('rejects malformed public rows before they enter application state', async () => {
    const repository = new SupabasePublicCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      fetchImplementation: async (input) => {
        const url = new URL(String(input));

        if (url.pathname.endsWith('/categories')) {
          return jsonResponse([
            {
              id: 'draft-category-without-prefix',
              slug: 'invalid',
              name: 'Invalid',
              description: 'Invalid',
            },
          ]);
        }

        return jsonResponse([]);
      },
    });

    await expect(repository.load({ signal: new AbortController().signal })).rejects.toMatchObject({
      code: 'invalid-response',
    });
  });

  test('validates campaign ids and hosted/local publishable credentials', () => {
    expect(
      () =>
        new SupabasePublicCatalogRepository({
          projectUrl: PROJECT_URL,
          publishableKey: PUBLISHABLE_KEY,
          campaignId: 'not-a-campaign-id',
        }),
    ).toThrowError(expect.objectContaining({ code: 'configuration-invalid' }));

    expect(
      () =>
        new SupabasePublicCatalogRepository({
          projectUrl: PROJECT_URL,
          publishableKey: LEGACY_ANON_KEY,
        }),
    ).toThrowError(expect.objectContaining({ code: 'configuration-invalid' }));

    expect(
      () =>
        new SupabasePublicCatalogRepository({
          projectUrl: LOCAL_PROJECT_URL,
          publishableKey: LEGACY_ANON_KEY,
          allowLocalProject: true,
        }),
    ).not.toThrow();

    expect(
      () =>
        new SupabasePublicCatalogRepository({
          projectUrl: LOCAL_PROJECT_URL,
          publishableKey: LEGACY_SERVICE_ROLE_KEY,
          allowLocalProject: true,
        }),
    ).toThrowError(expect.objectContaining({ code: 'configuration-invalid' }));
  });
});
