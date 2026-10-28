import { describe, expect, it, vi } from 'vitest';
import { SupabaseLocalMapRepository, AdminLocalMapError } from './adminLocalMapRepository';
import { BrowserAuthSessionStorage, AUTH_SESSION_STORAGE_KEY } from './authSessionStorage';

const projectUrl = 'http://127.0.0.1:4173';
const publishableKey = 'sb_publishable_map078_test_key';
function createStorage(token = 'test-admin-token') {
  const entries = new Map<string, string>([
    [
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({ version: 1, accessToken: token, expiresAt: 9999999999 }),
    ],
  ]);
  const raw = {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem: (key: string) => entries.get(key) ?? null,
    key: (i: number) => [...entries.keys()][i] ?? null,
    removeItem: (key: string) => {
      entries.delete(key);
    },
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  } as Storage;
  return { storage: new BrowserAuthSessionStorage(raw), entries };
}
function jsonResponse(rows: unknown[], status = 200) {
  return new Response(JSON.stringify(rows), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Content-Range': rows.length ? '0-' + (rows.length - 1) + '/' + rows.length : '*/0',
    },
  });
}
const neverwinter = {
  id: 'map-neverwinter',
  slug: 'neverwinter',
  name: 'Neverwinter',
  parent_id: null,
  width: 2048,
  height: 1582,
  publication_status: 'published',
  image_uri: null,
  loading_strategy: null,
  source_url: null,
  rights_holder: null,
  attribution: null,
  license_notes: 'RIGHTS_METADATA_PENDING',
  updated_at: '2026-10-28T10:00:00Z',
};
function makeRepo(handler: (url: URL, init: RequestInit) => Promise<Response>) {
  const auth = createStorage();
  const fetchImplementation = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    return handler(new URL(String(input)), init ?? {});
  });
  const repo = new SupabaseLocalMapRepository({
    projectUrl,
    publishableKey,
    allowLocalProject: true,
    storage: auth.storage,
    fetchImplementation: fetchImplementation as unknown as typeof fetch,
    timeoutMs: 1000,
  });
  return { repo, fetchImplementation, auth };
}
const signal = () => new AbortController().signal;
describe('MAP-078 administrative Data API repository', () => {
  it('lists global Neverwinter with admin bearer and explicit count range', async () => {
    const { repo, fetchImplementation } = makeRepo(async (url, init) => {
      expect(url.pathname).toBe('/rest/v1/map_contexts');
      expect(url.searchParams.has('campaign_id')).toBe(false);
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer test-admin-token',
      );
      expect((init.headers as Record<string, string>).apikey).toBe(publishableKey);
      return jsonResponse([neverwinter]);
    });
    const rows = await repo.listContexts(signal());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.imageUri).toBeNull();
    expect(rows[0]?.width).toBe(2048);
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });
  it('requires valid session before any I/O', async () => {
    const { repo, auth, fetchImplementation } = makeRepo(async () => jsonResponse([]));
    auth.entries.clear();
    await expect(repo.listContexts(signal())).rejects.toMatchObject({ code: 'session-expired' });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
  it.each([
    [401, 'session-expired'],
    [403, 'unauthorized'],
  ] as const)('translates HTTP %s into %s', async (status, code) => {
    const { repo } = makeRepo(async () => new Response('{}', { status }));
    await expect(repo.listContexts(signal())).rejects.toMatchObject({ code, status });
  });
  it('maps unique and SQL constraint failures without exposing raw SQL', async () => {
    for (const [pgCode, expected] of [
      ['23505', 'conflict'],
      ['23514', 'constraint'],
    ] as const) {
      const { repo } = makeRepo(
        async () =>
          new Response(
            JSON.stringify({
              code: pgCode,
              message: 'map dimensions cannot change while placements exist',
            }),
            { status: 409 },
          ),
      );
      const binding = {
        campaignId: 'campaign-test',
        geographicNameId: 'geo-test',
        mapContextId: 'map-test',
      };
      await expect(repo.saveBinding(binding, signal())).rejects.toMatchObject({ code: expected });
    }
  });
  it('rejects incomplete paginated result rather than silently dropping maps', async () => {
    const { repo } = makeRepo(
      async () =>
        new Response(JSON.stringify([neverwinter]), {
          status: 200,
          headers: { 'content-type': 'application/json', 'content-range': '0-0/10' },
        }),
    );
    await expect(repo.listContexts(signal())).rejects.toMatchObject({ code: 'invalid-response' });
  });
  it('preserves campaign filtering on binding reads', async () => {
    const { repo } = makeRepo(async (url) => {
      expect(url.searchParams.get('campaign_id')).toBe('eq.campaign-a');
      return jsonResponse([
        {
          campaign_id: 'campaign-a',
          geographic_name_id: 'geo-a',
          map_context_id: 'map-neverwinter',
        },
        {
          campaign_id: 'campaign-b',
          geographic_name_id: 'geo-b',
          map_context_id: 'map-neverwinter',
        },
      ]);
    });
    const rows = await repo.listBindings('campaign-a', signal());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.campaignId).toBe('campaign-a');
  });
  it('never offers organization for placement even on malformed server rows', async () => {
    const { repo } = makeRepo(async () =>
      jsonResponse([
        { id: 'org-test', name: 'Org', entity_type: 'organization' },
        { id: 'character-test', name: 'Character', entity_type: 'character' },
      ]),
    );
    const rows = await repo.listEntities('campaign-a', signal());
    expect(rows.map((x) => x.id)).toEqual(['character-test']);
  });
  it('uses optimistic updated_at and refuses empty update responses', async () => {
    const { repo } = makeRepo(async (url, init) => {
      expect(init.method).toBe('PATCH');
      expect(url.searchParams.get('updated_at')).toBe('eq.' + neverwinter.updated_at);
      return jsonResponse([]);
    });
    const row = await (async () => {
      const { repo: r } = makeRepo(async () => jsonResponse([neverwinter]));
      return (await r.listContexts(signal()))[0]!;
    })();
    await expect(repo.saveContext({ ...row, name: 'Edited' }, row, signal())).rejects.toMatchObject(
      { code: 'stale' },
    );
  });
  it('treats failed network access as recoverable backend error', async () => {
    const { repo } = makeRepo(async () => {
      throw new TypeError('network down');
    });
    await expect(repo.listContexts(signal())).rejects.toBeInstanceOf(AdminLocalMapError);
  });
});
