import { describe, expect, it, vi } from 'vitest';

import type { AdminPlayerRecord } from '../../domain/adminCampaignRoster';
import { BrowserAuthSessionStorage } from './authSessionStorage';
import { SupabaseAdminCampaignRosterRepository } from './adminCampaignRosterRepository';

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
const ACCESS_TOKEN = 'map054-admin-access-token';
const PUBLISHABLE_KEY = 'sb_publishable_map054_campaign_roster_test_key';
const PROJECT_URL = 'https://example-project.supabase.co';
const CAMPAIGN_A = '00000000-0000-4000-8000-000000000053';
const CAMPAIGN_B = '00000000-0000-4000-8000-000000000054';

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

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

function playerRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'player-map054-b',
    campaign_id: CAMPAIGN_B,
    slug: 'map054-b',
    display_name: 'Player B',
    publication_status: 'published',
    published_at: '2026-08-26T10:00:00.000Z',
    display_order: 2,
    accent_color: '#1e3a8a',
    archived_at: null,
    updated_at: '2026-08-26T10:00:00.000Z',
    ...overrides,
  };
}

function repository(fetchImplementation: typeof fetch, uuid = '12345678-1234-4000-8000-123456789abc') {
  return new SupabaseAdminCampaignRosterRepository({
    projectUrl: PROJECT_URL,
    publishableKey: PUBLISHABLE_KEY,
    storage: createStorage(),
    fetchImplementation,
    now: () => 1_700_000_000_000,
    uuid: () => uuid,
  });
}

describe('SupabaseAdminCampaignRosterRepository', () => {
  it('scopes roster reads to the selected campaign and rejects mixed responses', async () => {
    const goodFetch = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('campaign_id')).toBe(`eq.${CAMPAIGN_B}`);
      return jsonResponse([playerRow()], { headers: { 'Content-Range': '0-0/1' } });
    });

    await expect(
      repository(goodFetch).listPlayers(CAMPAIGN_B, { signal: new AbortController().signal }),
    ).resolves.toHaveLength(1);

    const mixedFetch = vi.fn<typeof fetch>(async () =>
      jsonResponse([playerRow({ campaign_id: CAMPAIGN_A })], {
        headers: { 'Content-Range': '0-0/1' },
      }),
    );
    await expect(
      repository(mixedFetch).listPlayers(CAMPAIGN_B, {
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('creates a player only in the campaign explicitly supplied by the controller', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        campaign_id: CAMPAIGN_B,
        id: 'player-12345678123440008000123456789abc',
        publication_status: 'published',
        accent_color: '#1e3a8a',
      });
      return jsonResponse([
        playerRow({
          id: body.id,
          slug: body.slug,
          display_name: body.display_name,
          display_order: body.display_order,
          accent_color: body.accent_color,
        }),
      ]);
    });

    const created = await repository(fetchImplementation).createPlayer(
      CAMPAIGN_B,
      { displayName: 'Player B', displayOrder: 2, accentColor: '#1E3A8A' },
      { signal: new AbortController().signal },
    );

    expect(created.campaignId).toBe(CAMPAIGN_B);
    expect(created.accentColor).toBe('#1e3a8a');
  });

  it('uses id, campaign_id and updated_at together for roster edits', async () => {
    const original: AdminPlayerRecord = {
      id: 'player-map054-b',
      campaignId: CAMPAIGN_B,
      slug: 'map054-b',
      displayName: 'Player B',
      publicationStatus: 'published',
      publishedAt: '2026-08-26T10:00:00.000Z',
      displayOrder: 2,
      accentColor: '#1e3a8a',
      archivedAt: null,
      updatedAt: '2026-08-26T10:00:00.000Z',
    };
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('id')).toBe('eq.player-map054-b');
      expect(url.searchParams.get('campaign_id')).toBe(`eq.${CAMPAIGN_B}`);
      expect(url.searchParams.get('updated_at')).toBe(`eq.${original.updatedAt}`);
      return jsonResponse([
        playerRow({
          display_name: 'Player B edited',
          updated_at: '2026-08-26T10:01:00.000Z',
        }),
      ]);
    });

    const updated = await repository(fetchImplementation).updatePlayer(
      CAMPAIGN_B,
      original,
      { displayName: 'Player B edited', displayOrder: 2, accentColor: '#1e3a8a' },
      { signal: new AbortController().signal },
    );

    expect(updated.displayName).toBe('Player B edited');
  });

  it('restores a previously published player through archived to draft to published', async () => {
    const archived: AdminPlayerRecord = {
      id: 'player-map054-b',
      campaignId: CAMPAIGN_B,
      slug: 'map054-b',
      displayName: 'Player B',
      publicationStatus: 'archived',
      publishedAt: '2026-08-20T10:00:00.000Z',
      displayOrder: 2,
      accentColor: '#1e3a8a',
      archivedAt: '2026-08-26T10:00:00.000Z',
      updatedAt: '2026-08-26T10:00:00.000Z',
    };
    const requestedStatuses: string[] = [];
    const fetchImplementation = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestedStatuses.push(String(body.publication_status));
      const status = String(body.publication_status);
      return jsonResponse([
        playerRow({
          publication_status: status,
          published_at: archived.publishedAt,
          archived_at: status === 'archived' ? archived.archivedAt : null,
          updated_at:
            status === 'draft'
              ? '2026-08-26T10:01:00.000Z'
              : '2026-08-26T10:02:00.000Z',
        }),
      ]);
    });

    const restored = await repository(fetchImplementation).setPlayerArchived(
      CAMPAIGN_B,
      archived,
      false,
      { signal: new AbortController().signal },
    );

    expect(requestedStatuses).toEqual(['draft', 'published']);
    expect(restored.publicationStatus).toBe('published');
    expect(restored.publishedAt).toBe(archived.publishedAt);
  });
});
