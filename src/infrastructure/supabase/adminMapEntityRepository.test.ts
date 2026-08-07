import { describe, expect, it, vi } from 'vitest';

import type { AdminMapEntityDetail, AdminMapEntityDraft } from '../../domain/adminMapEntities';
import { BrowserAuthSessionStorage } from './authSessionStorage';
import { SupabaseAdminMapEntityRepository } from './adminMapEntityRepository';

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const SESSION_KEY = 'castigo-divino-map:auth:v1';
const ACCESS_TOKEN = 'map019-admin-access-token';
const PUBLISHABLE_KEY = 'sb_publishable_map019_admin_entities_test_key';
const PROJECT_URL = 'https://example-project.supabase.co';

function createStorage(): BrowserAuthSessionStorage {
  const storage = new MemoryStorage();
  storage.setItem(
    SESSION_KEY,
    JSON.stringify({
      version: 1,
      accessToken: ACCESS_TOKEN,
      refreshToken: 'refresh-token',
      expiresAt: 4_000_000_000,
      userId: '00000000-0000-4000-8000-000000000001',
      email: 'admin@example.invalid',
    }),
  );
  return new BrowserAuthSessionStorage(storage);
}

const detailPayload = {
  record: {
    id: 'entity-map019',
    slug: 'map019',
    entity_type: 'character',
    visibility: 'pin',
    name: 'MAP-019',
    summary: '',
    description: '',
    x: 1800,
    y: 1200,
    category_id: 'category-people',
    publication_status: 'draft',
    published_at: null,
    archived_at: null,
    updated_at: '2026-08-07T12:00:00.000Z',
  },
  tag_links: [
    {
      id: 'entity-tag-map019',
      tag_id: 'notable',
      publication_status: 'draft',
      published_at: null,
      updated_at: '2026-08-07T12:00:01.000Z',
    },
  ],
  dispositions: [
    {
      player_id: 'player-one',
      display_name: 'Player One',
      disposition: 'ally',
      updated_at: '2026-08-07T12:00:02.000Z',
    },
  ],
  relations_revision: 'revision-1',
  delete_blockers: {
    aliases: 0,
    tags: 0,
    geographic_names: 0,
    notes: 0,
    location_events: 0,
    requests: 0,
  },
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

function draft(): AdminMapEntityDraft {
  return {
    id: 'entity-map019',
    slug: 'map019',
    entityType: 'character',
    visibility: 'pin',
    name: 'MAP-019',
    summary: '',
    description: '',
    x: 1800,
    y: 1200,
    categoryId: 'category-people',
    tagIds: ['notable'],
    dispositions: [{ playerId: 'player-one', disposition: 'ally' }],
    publicationStatus: 'draft',
  };
}

function detail(): AdminMapEntityDetail {
  return {
    record: {
      id: 'entity-map019',
      slug: 'map019',
      entityType: 'character',
      visibility: 'pin',
      name: 'MAP-019',
      summary: '',
      description: '',
      x: 1800,
      y: 1200,
      categoryId: 'category-people',
      publicationStatus: 'draft',
      publishedAt: null,
      archivedAt: null,
      updatedAt: '2026-08-07T12:00:00.000Z',
    },
    tagLinks: [],
    dispositions: [
      {
        playerId: 'player-one',
        displayName: 'Player One',
        disposition: 'ally',
        updatedAt: '2026-08-07T12:00:02.000Z',
      },
    ],
    relationsRevision: 'revision-1',
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

describe('SupabaseAdminMapEntityRepository', () => {
  it('loads editor snapshots with a just-in-time administrative JWT', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
      expect(headers.get('apikey')).toBe(PUBLISHABLE_KEY);
      return jsonResponse(detailPayload);
    });
    const repository = new SupabaseAdminMapEntityRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      storage: createStorage(),
      fetchImplementation,
      now: () => 1_700_000_000_000,
    });

    await expect(
      repository.load('entity-map019', { signal: new AbortController().signal }),
    ).resolves.toMatchObject({
      record: { id: 'entity-map019', entityType: 'character' },
      relationsRevision: 'revision-1',
    });
  });

  it('sends entity and relation locks through the atomic save RPC', async () => {
    const original = detail();
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      expect(new URL(String(input)).pathname).toEndWith('/rpc/admin_save_map_entity');
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        p_id: 'entity-map019',
        p_expected_updated_at: original.record.updatedAt,
        p_expected_relations_revision: original.relationsRevision,
        p_tag_ids: ['notable'],
      });
      return jsonResponse(detailPayload);
    });
    const repository = new SupabaseAdminMapEntityRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      storage: createStorage(),
      fetchImplementation,
      now: () => 1_700_000_000_000,
    });

    await expect(
      repository.save(original, draft(), { signal: new AbortController().signal }),
    ).resolves.toMatchObject({ record: { id: 'entity-map019' } });
  });

  it('normalizes stale writes and invalid relations without leaking PostgreSQL messages', async () => {
    for (const [databaseCode, expectedCode] of [
      ['40001', 'stale-write'],
      ['23503', 'invalid-relation'],
      ['23514', 'operation-prohibited'],
    ] as const) {
      const repository = new SupabaseAdminMapEntityRepository({
        projectUrl: PROJECT_URL,
        publishableKey: PUBLISHABLE_KEY,
        storage: createStorage(),
        fetchImplementation: vi.fn<typeof fetch>(async () =>
          jsonResponse(
            { code: databaseCode, message: 'secret postgres implementation detail' },
            { status: 409 },
          ),
        ),
        now: () => 1_700_000_000_000,
      });
      await expect(
        repository.save(detail(), draft(), { signal: new AbortController().signal }),
      ).rejects.toMatchObject({
        code: expectedCode,
        message: expect.not.stringContaining('secret postgres'),
      });
    }
  });

  it('uses updated_at on exceptional physical deletion and blocks known relations client-side', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      expect(init?.method).toBe('DELETE');
      expect(url.searchParams.get('id')).toBe('eq.entity-map019');
      expect(url.searchParams.get('updated_at')).toBe('eq.2026-08-07T12:00:00.000Z');
      return jsonResponse([{ id: 'entity-map019' }]);
    });
    const repository = new SupabaseAdminMapEntityRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      storage: createStorage(),
      fetchImplementation,
      now: () => 1_700_000_000_000,
    });
    await expect(
      repository.delete(detail(), { signal: new AbortController().signal }),
    ).resolves.toBeUndefined();

    const referenced = detail();
    await expect(
      repository.delete(
        {
          ...referenced,
          deleteBlockers: { ...referenced.deleteBlockers, aliases: 1 },
        },
        { signal: new AbortController().signal },
      ),
    ).rejects.toMatchObject({ code: 'operation-prohibited' });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('treats 401 and 403 as authorization failures', async () => {
    for (const [status, code] of [
      [401, 'session-expired'],
      [403, 'unauthorized'],
    ] as const) {
      const repository = new SupabaseAdminMapEntityRepository({
        projectUrl: PROJECT_URL,
        publishableKey: PUBLISHABLE_KEY,
        storage: createStorage(),
        fetchImplementation: vi.fn<typeof fetch>(async () => jsonResponse({}, { status })),
        now: () => 1_700_000_000_000,
      });
      await expect(
        repository.load('entity-map019', { signal: new AbortController().signal }),
      ).rejects.toMatchObject({ code, status });
    }
  });
});
