import { describe, expect, it, vi } from 'vitest';
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

function storage(): BrowserAuthSessionStorage {
  const memory = new MemoryStorage();
  memory.setItem(
    'castigo-divino-map:auth:v1',
    JSON.stringify({
      version: 1,
      accessToken: 'map027-admin-access-token',
      refreshToken: 'refresh-token',
      expiresAt: 4_000_000_000,
      userId: '00000000-0000-4000-8000-000000000001',
      email: 'admin@example.invalid',
    }),
  );
  return new BrowserAuthSessionStorage(memory);
}

describe('MAP-027 converted drafts in the entity repository', () => {
  it('maps a nullable database category to the existing empty editor option', async () => {
    const row = {
      id: 'entity-request-1000',
      slug: 'request-1000',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Converted request',
      summary: '',
      description: 'Editable draft',
      x: 1200,
      y: 900,
      category_id: null,
      publication_status: 'draft',
      published_at: null,
      archived_at: null,
      updated_at: '2026-08-08T12:00:00.000Z',
    };
    const fetchImplementation = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify([row]), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Range': '0-0/1',
          },
        }),
    );
    const repository = new SupabaseAdminMapEntityRepository({
      projectUrl: 'https://example-project.supabase.co',
      publishableKey: 'sb_publishable_map027_converted_draft_key',
      storage: storage(),
      fetchImplementation,
      now: () => 1_700_000_000_000,
    });

    await expect(repository.list({ signal: new AbortController().signal })).resolves.toEqual([
      expect.objectContaining({
        id: 'entity-request-1000',
        categoryId: '',
        publicationStatus: 'draft',
      }),
    ]);
  });
});
