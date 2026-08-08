import { describe, expect, it, vi } from 'vitest';
import type { AdminPublicRequestRecord } from '../../domain/adminPublicRequests';
import { BrowserAuthSessionStorage } from './authSessionStorage';
import { SupabaseAdminPublicRequestRepository } from './adminPublicRequestRepository';

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

const ACCESS_TOKEN = 'map027-admin-access-token';
const PUBLISHABLE_KEY = 'sb_publishable_map027_admin_requests_key';
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
  id: '10000000-0000-4000-8000-000000000271',
  sender_name: 'Visitor',
  proposed_name: 'Requested Place',
  entity_type: 'location',
  x: 1200,
  y: 900,
  description: 'Description',
  reason: 'Reason',
  request_status: 'pending',
  moderator_user_id: null,
  moderation_note: null,
  converted_entity_id: null,
  moderated_at: null,
  created_at: '2026-08-08T10:00:00.000Z',
  updated_at: '2026-08-08T10:00:00.000Z',
};

const request: AdminPublicRequestRecord = {
  id: row.id,
  senderName: row.sender_name,
  proposedName: row.proposed_name,
  entityType: 'location',
  x: row.x,
  y: row.y,
  description: row.description,
  reason: row.reason,
  requestStatus: 'pending',
  moderatorUserId: null,
  moderationNote: null,
  convertedEntityId: null,
  moderatedAt: null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
};

function repository(fetchImplementation: typeof fetch): SupabaseAdminPublicRequestRepository {
  return new SupabaseAdminPublicRequestRepository({
    projectUrl: PROJECT_URL,
    publishableKey: PUBLISHABLE_KEY,
    storage: storage(),
    fetchImplementation,
    now: () => 1_700_000_000_000,
  });
}

describe('SupabaseAdminPublicRequestRepository', () => {
  it('lists private requests with the current administrative JWT without exact counts', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const headers = new Headers(init?.headers);
      const url = new URL(String(input));
      expect(headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
      expect(headers.get('apikey')).toBe(PUBLISHABLE_KEY);
      expect(headers.get('prefer')).toBeNull();
      expect(url.searchParams.get('limit')).toBe('1000');
      expect(url.searchParams.get('order')).toBe('created_at.desc,id.asc');
      return new Response(JSON.stringify([row]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await expect(
      repository(fetchImplementation).list({ signal: new AbortController().signal }),
    ).resolves.toEqual([request]);
  });

  it('uses a stable created-at/id cursor instead of offset and total-count paging', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      ...row,
      id: `request-${String(index).padStart(4, '0')}`,
    }));
    const finalRow = { ...row, id: 'request-1000' };
    let call = 0;
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      call += 1;
      const url = new URL(String(input));
      expect(url.searchParams.get('limit')).toBe('1000');
      expect(url.searchParams.get('offset')).toBeNull();
      if (call === 1) {
        expect(url.searchParams.get('or')).toBeNull();
        return new Response(JSON.stringify(firstPage), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      expect(url.searchParams.get('or')).toBe(
        '(created_at.lt."2026-08-08T10:00:00.000Z",and(created_at.eq."2026-08-08T10:00:00.000Z",id.gt."request-0999"))',
      );
      return new Response(JSON.stringify([finalRow]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await repository(fetchImplementation).list({
      signal: new AbortController().signal,
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1001);
    expect(result.at(-1)?.id).toBe('request-1000');
  });

  it('sends the optimistic revision and closed conversion action to the RPC', async () => {
    const converted = {
      ...row,
      request_status: 'converted',
      moderator_user_id: '00000000-0000-4000-8000-000000000001',
      moderation_note: 'Reviewed',
      converted_entity_id: 'entity-request-1000',
      moderated_at: '2026-08-08T11:00:00.000Z',
      updated_at: '2026-08-08T11:00:00.000Z',
    };
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      expect(new URL(String(input)).pathname).toMatch(/\/rpc\/admin_moderate_public_request$/);
      expect(JSON.parse(String(init?.body))).toEqual({
        p_request_id: request.id,
        p_expected_updated_at: request.updatedAt,
        p_action: 'convert',
        p_moderation_note: 'Reviewed',
      });
      return new Response(
        JSON.stringify({ request: converted, draft_entity_id: 'entity-request-1000' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    await expect(
      repository(fetchImplementation).convert(request, ' Reviewed ', {
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      request: { requestStatus: 'converted', convertedEntityId: 'entity-request-1000' },
      draftEntityId: 'entity-request-1000',
    });
  });

  it('normalizes stale and authorization failures without leaking PostgreSQL details', async () => {
    const stale = repository(
      vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify({ code: '40001', message: 'secret row-lock implementation detail' }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    await expect(
      stale.reject(request, '', { signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      code: 'stale-write',
      message: expect.not.stringContaining('secret row-lock'),
    });

    const expired = repository(
      vi.fn<typeof fetch>(
        async () =>
          new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } }),
      ),
    );
    await expect(
      expired.reject(request, '', { signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'session-expired', status: 401 });
  });
});
