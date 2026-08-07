import { describe, expect, it, vi } from 'vitest';

import { AdminCatalogRepositoryError } from '../../data-access/adminCatalog';
import type { AdminCategory } from '../../domain/adminCatalog';
import { BrowserAuthSessionStorage } from './authSessionStorage';
import { SupabaseAdminCatalogRepository } from './adminCatalogRepository';

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

const SESSION_KEY = 'castigo-divino-map:auth:v1';
const ACCESS_TOKEN = 'map018-admin-access-token';
const PUBLISHABLE_KEY = 'sb_publishable_map018_admin_catalog_test_key';
const PROJECT_URL = 'https://example-project.supabase.co';

function createStorage(expiresAt = 4_000_000_000): BrowserAuthSessionStorage {
  const storage = new MemoryStorage();
  storage.setItem(
    SESSION_KEY,
    JSON.stringify({
      version: 1,
      accessToken: ACCESS_TOKEN,
      refreshToken: 'refresh-token',
      expiresAt,
      userId: '00000000-0000-4000-8000-000000000001',
      email: 'admin@example.invalid',
    }),
  );
  return new BrowserAuthSessionStorage(storage);
}

const categoryRow = {
  id: 'category-cities',
  slug: 'cities',
  name: 'Cities',
  description: '',
  publication_status: 'draft',
  published_at: null,
  updated_at: '2026-08-07T10:00:00.000Z',
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

describe('SupabaseAdminCatalogRepository', () => {
  it('adds the administrative JWT only to protected catalogue requests', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
      expect(headers.get('apikey')).toBe(PUBLISHABLE_KEY);
      return jsonResponse([categoryRow], { headers: { 'Content-Range': '0-0/1' } });
    });
    const repository = new SupabaseAdminCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      storage: createStorage(),
      fetchImplementation,
      now: () => 1_700_000_000_000,
    });

    const records = await repository.list('category', { signal: new AbortController().signal });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: 'category', id: 'category-cities', name: 'Cities' });
  });

  it('uses optimistic updated_at filtering for edits', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      expect(init?.method).toBe('PATCH');
      expect(url.searchParams.get('id')).toBe('eq.category-cities');
      expect(url.searchParams.get('updated_at')).toBe('eq.2026-08-07T10:00:00.000Z');
      return jsonResponse([
        { ...categoryRow, name: 'Great Cities', updated_at: '2026-08-07T10:01:00.000Z' },
      ]);
    });
    const repository = new SupabaseAdminCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      storage: createStorage(),
      fetchImplementation,
      now: () => 1_700_000_000_000,
    });
    const original: AdminCategory = {
      kind: 'category',
      id: categoryRow.id,
      slug: categoryRow.slug,
      name: categoryRow.name,
      description: '',
      publicationStatus: 'draft',
      publishedAt: null,
      updatedAt: categoryRow.updated_at,
    };

    const updated = await repository.update(
      original,
      {
        kind: 'category',
        id: original.id,
        slug: original.slug,
        name: 'Great Cities',
        description: '',
        publicationStatus: 'draft',
      },
      { signal: new AbortController().signal },
    );

    expect(updated).toMatchObject({ name: 'Great Cities', updatedAt: '2026-08-07T10:01:00.000Z' });
  });

  it('normalizes uniqueness errors without exposing SQL details', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      jsonResponse(
        {
          code: '23505',
          message: 'duplicate key value violates constraint secret_internal_name',
          details: 'sensitive database detail',
        },
        { status: 409 },
      ),
    );
    const repository = new SupabaseAdminCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      storage: createStorage(),
      fetchImplementation,
      now: () => 1_700_000_000_000,
    });

    await expect(
      repository.create(
        {
          kind: 'category',
          id: 'category-cities',
          slug: 'cities',
          name: 'Cities',
          description: '',
          publicationStatus: 'draft',
        },
        { signal: new AbortController().signal },
      ),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: expect.not.stringContaining('secret_internal_name'),
    });
  });

  it('turns 401 and missing sessions into closed session-expired errors', async () => {
    const unauthorized = new SupabaseAdminCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      storage: createStorage(),
      fetchImplementation: vi.fn<typeof fetch>(async () => jsonResponse({}, { status: 401 })),
      now: () => 1_700_000_000_000,
    });

    await expect(
      unauthorized.list('category', { signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'session-expired', status: 401 });

    const expired = new SupabaseAdminCatalogRepository({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      storage: createStorage(1),
      fetchImplementation: vi.fn<typeof fetch>(),
      now: () => 1_700_000_000_000,
    });
    await expect(
      expired.list('category', { signal: new AbortController().signal }),
    ).rejects.toBeInstanceOf(AdminCatalogRepositoryError);
    await expect(
      expired.list('category', { signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'session-expired' });
  });

  it('classifies relation and invariant failures without returning database bodies', async () => {
    const codes = [
      ['23503', 'referenced'],
      ['23514', 'operation-prohibited'],
      ['42501', 'unauthorized'],
    ] as const;

    for (const [databaseCode, expected] of codes) {
      const repository = new SupabaseAdminCatalogRepository({
        projectUrl: PROJECT_URL,
        publishableKey: PUBLISHABLE_KEY,
        storage: createStorage(),
        fetchImplementation: vi.fn<typeof fetch>(async () =>
          jsonResponse({ code: databaseCode, message: 'raw database message' }, { status: 409 }),
        ),
        now: () => 1_700_000_000_000,
      });
      await expect(
        repository.create(
          {
            kind: 'tag',
            id: 'test-tag',
            name: 'Test tag',
            description: '',
            publicationStatus: 'draft',
          },
          { signal: new AbortController().signal },
        ),
      ).rejects.toMatchObject({
        code: expected,
        message: expect.not.stringContaining('raw database'),
      });
    }
  });
});
