import { describe, expect, it, vi } from 'vitest';

import type { AdminCharacterLocationRelationRecord } from '../../domain/characterLocationRelations';
import { BrowserAuthSessionStorage } from './authSessionStorage';
import { SupabaseAdminCharacterLocationRelationRepository } from './adminCharacterLocationRelationRepository';

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

const ACCESS_TOKEN = 'map020-admin-access-token';
const PUBLISHABLE_KEY = 'sb_publishable_map020_admin_relation_test_key';
const PROJECT_URL = 'https://example-project.supabase.co';

function storage(): BrowserAuthSessionStorage {
  const memory = new MemoryStorage();
  memory.setItem(
    'castigo-divino-map:auth:v1',
    JSON.stringify({
      version: 1,
      accessToken: ACCESS_TOKEN,
      refreshToken: 'refresh-token',
      expiresAt: 4_000_000_000,
      userId: '00000000-0000-4000-8000-000000000001',
      email: 'admin@example.invalid',
    }),
  );
  return new BrowserAuthSessionStorage(memory);
}

const row = {
  character_id: 'entity-character',
  location_id: 'entity-location',
  relation_status: 'associated',
  publication_status: 'draft',
  published_at: null,
  archived_at: null,
  updated_at: '2026-08-07T12:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function original(): AdminCharacterLocationRelationRecord {
  return {
    characterId: 'entity-character',
    locationId: 'entity-location',
    relationStatus: 'associated',
    publicationStatus: 'draft',
    publishedAt: null,
    archivedAt: null,
    updatedAt: '2026-08-07T12:00:00.000Z',
  };
}

describe('SupabaseAdminCharacterLocationRelationRepository', () => {
  it('uses the just-in-time admin JWT and sends only writable columns on create', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init);
      expect(request.headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
      expect(request.headers.get('apikey')).toBe(PUBLISHABLE_KEY);
      expect(new URL(request.url).pathname).toMatch(/\/character_location_relations$/);
      expect(JSON.parse(String(init?.body))).toEqual({
        character_id: 'entity-character',
        location_id: 'entity-location',
        relation_status: 'associated',
        publication_status: 'draft',
      });
      return jsonResponse([row], 201);
    });
    const repository = new SupabaseAdminCharacterLocationRelationRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      storage: storage(),
      fetchImplementation,
      now: () => 1_700_000_000_000,
    });

    await expect(
      repository.create(
        {
          characterId: 'entity-character',
          locationId: 'entity-location',
          relationStatus: 'associated',
          publicationStatus: 'draft',
        },
        { signal: new AbortController().signal },
      ),
    ).resolves.toMatchObject({ characterId: 'entity-character', locationId: 'entity-location' });
  });

  it('locks updates with the composite identity and expected updated_at', async () => {
    const current = original();
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('character_id')).toBe(`eq.${current.characterId}`);
      expect(url.searchParams.get('location_id')).toBe(`eq.${current.locationId}`);
      expect(url.searchParams.get('updated_at')).toBe(`eq.${current.updatedAt}`);
      expect(JSON.parse(String(init?.body))).toEqual({
        relation_status: 'present',
        publication_status: 'published',
      });
      return jsonResponse([
        {
          ...row,
          relation_status: 'present',
          publication_status: 'published',
          published_at: '2026-08-07T12:01:00.000Z',
          updated_at: '2026-08-07T12:01:00.000Z',
        },
      ]);
    });
    const repository = new SupabaseAdminCharacterLocationRelationRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      storage: storage(),
      fetchImplementation,
      now: () => 1_700_000_000_000,
    });

    await expect(
      repository.update(
        current,
        {
          characterId: current.characterId,
          locationId: current.locationId,
          relationStatus: 'present',
          publicationStatus: 'published',
        },
        { signal: new AbortController().signal },
      ),
    ).resolves.toMatchObject({ relationStatus: 'present', publicationStatus: 'published' });
  });

  it('detects a stale zero-row PATCH and normalizes database integrity errors', async () => {
    const current = original();
    const staleRepository = new SupabaseAdminCharacterLocationRelationRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      storage: storage(),
      fetchImplementation: vi.fn<typeof fetch>(async () => jsonResponse([])),
      now: () => 1_700_000_000_000,
    });
    await expect(
      staleRepository.update(
        current,
        { ...current, relationStatus: 'last-seen' },
        { signal: new AbortController().signal },
      ),
    ).rejects.toMatchObject({ code: 'stale-write' });

    for (const [databaseCode, expectedCode] of [
      ['23505', 'conflict'],
      ['23503', 'invalid-relation'],
      ['23514', 'operation-prohibited'],
    ] as const) {
      const repository = new SupabaseAdminCharacterLocationRelationRepository({
        projectUrl: PROJECT_URL,
        publishableKey: PUBLISHABLE_KEY,
        storage: storage(),
        fetchImplementation: vi.fn<typeof fetch>(async () =>
          jsonResponse({ code: databaseCode, message: 'raw database detail' }, 409),
        ),
        now: () => 1_700_000_000_000,
      });
      await expect(
        repository.create(
          {
            characterId: 'entity-character',
            locationId: 'entity-location',
            relationStatus: 'associated',
            publicationStatus: 'draft',
          },
          { signal: new AbortController().signal },
        ),
      ).rejects.toMatchObject({ code: expectedCode });
    }
  });
});
