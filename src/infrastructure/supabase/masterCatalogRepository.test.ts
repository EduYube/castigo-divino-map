import { describe, expect, test } from 'vitest';

import { AUTH_SESSION_STORAGE_KEY, BrowserAuthSessionStorage } from './authSessionStorage';
import { SupabaseMasterCatalogRepository } from './masterCatalogRepository';

const PROJECT_URL = 'https://map055-master-test.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_map055_master_test_key';
const CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';
const NOW_MS = 1_700_000_000_000;
const ACCESS_TOKEN = 'map055-master-access-token';

const VALID_PAYLOAD = {
  entities: [
    {
      id: 'entity-master-test',
      slug: 'master-test',
      entity_type: 'character',
      visibility: 'pin',
      audience: 'master',
      name: 'Master Test',
      summary: 'Private summary',
      description: 'Private description',
      portrait_path: 'portraits/11111111-1111-4111-8111-111111111111.jpg',
      x: 100,
      y: 200,
      category_id: 'category-master-test',
      updated_at: '2026-08-28T00:00:00.000Z',
    },
  ],
  categories: [{ id: 'category-master-test', name: 'Master Category' }],
  aliases: [{ id: 'alias-master-test', entity_id: 'entity-master-test', value: 'Private alias' }],
  tags: [{ id: 'tag-master-test', name: 'Private tag' }],
  entity_tags: [{ entity_id: 'entity-master-test', tag_id: 'tag-master-test' }],
  players: [{ id: 'player-master-test', display_name: 'Private player', accent_color: '#475569' }],
  associations: [],
  dispositions: [
    {
      entity_id: 'entity-master-test',
      player_id: 'player-master-test',
      disposition: 'ally',
    },
  ],
  relations: [
    {
      character_id: 'entity-master-test',
      location_id: 'entity-public-location',
      relation_status: 'present',
    },
  ],
  relation_entities: [
    {
      id: 'entity-master-test',
      name: 'Master Test',
      entity_type: 'character',
      audience: 'master',
    },
    {
      id: 'entity-public-location',
      name: 'Public Location',
      entity_type: 'location',
      audience: 'public',
    },
  ],
};

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

  get length(): number {
    return this.#values.size;
  }

  clear(): void {
    this.#values.clear();
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.#values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}

function authenticatedStorage(): BrowserAuthSessionStorage {
  const storage = new BrowserAuthSessionStorage(new MemoryStorage());
  storage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      accessToken: ACCESS_TOKEN,
      expiresAt: 2_000_000_000,
    }),
  );
  return storage;
}

function repositoryWith(
  fetchImplementation: typeof fetch,
  options: { readonly timeoutMs?: number } = {},
): SupabaseMasterCatalogRepository {
  return new SupabaseMasterCatalogRepository({
    projectUrl: PROJECT_URL,
    publishableKey: PUBLISHABLE_KEY,
    storage: authenticatedStorage(),
    fetchImplementation,
    timeoutMs: options.timeoutMs,
    now: () => NOW_MS,
  });
}

describe('SupabaseMasterCatalogRepository', () => {
  test('uses only the campaign-scoped v4 RPC with the admin bearer session', async () => {
    const capturedRequests: Request[] = [];
    const repository = repositoryWith(async (input, init) => {
      capturedRequests.push(new Request(input, init));
      return new Response(JSON.stringify(VALID_PAYLOAD), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await repository.load({
      signal: new AbortController().signal,
      campaignId: CAMPAIGN_ID,
    });

    expect(capturedRequests).toHaveLength(1);
    const request = capturedRequests[0];
    expect(request).toBeDefined();
    if (!request) return;

    expect(request.method).toBe('POST');
    expect(new URL(request.url).pathname).toBe('/rest/v1/rpc/admin_get_master_catalog_v4');
    expect(request.headers.get('apikey')).toBe(PUBLISHABLE_KEY);
    expect(request.headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(request.headers.get('content-type')).toBe('application/json');
    expect(request.cache).toBe('no-store');
    expect(await request.json()).toEqual({ p_campaign_id: CAMPAIGN_ID });
    expect(request.url).not.toContain('admin_get_master_catalog_v2');
    expect(request.url).not.toMatch(/admin_get_master_catalog(?:\?|$)/);

    expect(result).toMatchObject({
      entities: [
        {
          id: 'entity-master-test',
          audience: 'master',
          portraitPath: 'portraits/11111111-1111-4111-8111-111111111111.jpg',
        },
      ],
      entityTags: [{ entityId: 'entity-master-test', tagId: 'tag-master-test' }],
      dispositions: [
        {
          entityId: 'entity-master-test',
          playerId: 'player-master-test',
          disposition: 'ally',
        },
      ],
      relations: [
        {
          characterId: 'entity-master-test',
          locationId: 'entity-public-location',
          relationStatus: 'present',
        },
      ],
    });
  });

  test('rejects a malformed campaign id before any network request', async () => {
    let requests = 0;
    const repository = repositoryWith(async () => {
      requests += 1;
      return new Response(JSON.stringify(VALID_PAYLOAD));
    });

    await expect(
      repository.load({
        signal: new AbortController().signal,
        campaignId: 'not-a-campaign',
      }),
    ).rejects.toMatchObject({ code: 'unexpected' });
    expect(requests).toBe(0);
  });

  test.each([
    [401, 'session-expired'],
    [403, 'unauthorized'],
    [503, 'backend-unavailable'],
    [400, 'unexpected'],
  ] as const)('normalizes HTTP %s without falling back to a legacy RPC', async (status, code) => {
    const requestedPaths: string[] = [];
    const repository = repositoryWith(async (input) => {
      requestedPaths.push(
        new URL(input instanceof Request ? input.url : input.toString()).pathname,
      );
      return new Response('{}', { status });
    });

    await expect(
      repository.load({
        signal: new AbortController().signal,
        campaignId: CAMPAIGN_ID,
      }),
    ).rejects.toMatchObject({ code, status });

    expect(requestedPaths).toEqual(['/rest/v1/rpc/admin_get_master_catalog_v4']);
  });

  test('fails closed on malformed successful payloads', async () => {
    const repository = repositoryWith(
      async () =>
        new Response('{"entities":[]}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    await expect(
      repository.load({
        signal: new AbortController().signal,
        campaignId: CAMPAIGN_ID,
      }),
    ).rejects.toMatchObject({ code: 'invalid-response' });
  });

  test('normalizes its own deadline as request-timeout', async () => {
    const repository = repositoryWith(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error('Missing request signal.'));
            return;
          }
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
      { timeoutMs: 5 },
    );

    await expect(
      repository.load({
        signal: new AbortController().signal,
        campaignId: CAMPAIGN_ID,
      }),
    ).rejects.toMatchObject({ code: 'request-timeout' });
  });
});
