import { describe, expect, it, vi } from 'vitest';
import { AUTH_SESSION_STORAGE_KEY, BrowserAuthSessionStorage } from './authSessionStorage';
import { SupabaseCharacterPortraitResources } from './characterPortraitResources';

const PROJECT_URL = 'https://example-project.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_map045_portrait_test_key';
const PATH = 'portraits/123e4567-e89b-42d3-a456-426614174000.webp';

function storageWithSession(): BrowserAuthSessionStorage {
  const memory = new Map<string, string>();
  memory.set(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({ version: 1, accessToken: 'admin-jwt', expiresAt: 4_000_000_000 }),
  );
  return new BrowserAuthSessionStorage({
    get length() {
      return memory.size;
    },
    clear: () => memory.clear(),
    getItem: (key) => memory.get(key) ?? null,
    key: (index) => [...memory.keys()][index] ?? null,
    removeItem: (key) => void memory.delete(key),
    setItem: (key, value) => void memory.set(key, value),
  });
}

function imageResponse(status = 200, type = 'image/webp'): Response {
  return new Response(new Uint8Array([1, 2, 3]), {
    status,
    headers: { 'content-type': type },
  });
}

function resources(fetchImplementation: typeof fetch) {
  const createObjectUrl = vi.fn(() => 'blob:portrait');
  const revokeObjectUrl = vi.fn();
  return {
    createObjectUrl,
    revokeObjectUrl,
    subject: new SupabaseCharacterPortraitResources({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      storage: storageWithSession(),
      fetchImplementation,
      now: () => 1,
      createObjectUrl,
      revokeObjectUrl,
    }),
  };
}

describe('SupabaseCharacterPortraitResources', () => {
  it('loads a public marker thumbnail with the anonymous/public credential, never the admin JWT', async () => {
    const fetchImplementation = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ apikey: PUBLISHABLE_KEY });
      expect(init?.headers).not.toHaveProperty('Authorization');
      expect(init?.cache).toBe('no-store');
      return imageResponse();
    });
    const { subject } = resources(fetchImplementation as unknown as typeof fetch);

    const url = await subject.load(PATH, {
      access: 'public',
      variant: 'marker',
      signal: new AbortController().signal,
    });

    expect(url).toBe('blob:portrait');
    const requested = String(fetchImplementation.mock.calls[0]?.[0]);
    expect(requested).toContain('/storage/v1/render/image/authenticated/character-portraits/');
    expect(requested).toContain('width=96');
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    subject.destroy();
  });

  it('falls back to the same authorized private object when image transformations are unavailable', async () => {
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ apikey: PUBLISHABLE_KEY });
      expect(init?.headers).not.toHaveProperty('Authorization');
      expect(init?.cache).toBe('no-store');
      const requested = String(input);
      if (requested.includes('/storage/v1/render/image/authenticated/')) return imageResponse(403);
      return imageResponse();
    });
    const { subject } = resources(fetchImplementation as unknown as typeof fetch);

    await expect(
      subject.load(PATH, {
        access: 'public',
        variant: 'marker',
        signal: new AbortController().signal,
      }),
    ).resolves.toBe('blob:portrait');

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(String(fetchImplementation.mock.calls[0]?.[0])).toContain(
      '/storage/v1/render/image/authenticated/character-portraits/',
    );
    expect(String(fetchImplementation.mock.calls[1]?.[0])).toContain(
      '/storage/v1/object/authenticated/character-portraits/',
    );
    subject.destroy();
  });

  it('uses the current admin JWT only for master portraits', async () => {
    const fetchImplementation = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer admin-jwt' });
      return imageResponse();
    });
    const { subject } = resources(fetchImplementation as unknown as typeof fetch);

    await subject.load(PATH, {
      access: 'master',
      variant: 'detail',
      signal: new AbortController().signal,
    });

    expect(String(fetchImplementation.mock.calls[0]?.[0])).toContain(
      '/storage/v1/object/authenticated/character-portraits/',
    );
    subject.destroy();
  });

  it('fails closed on authorization, invalid MIME and invalid paths', async () => {
    const denied = resources(vi.fn(async () => imageResponse(403)) as unknown as typeof fetch);
    await expect(
      denied.subject.load(PATH, {
        access: 'master',
        variant: 'detail',
        signal: new AbortController().signal,
      }),
    ).resolves.toBeNull();

    const html = resources(
      vi.fn(async () => imageResponse(200, 'text/html')) as unknown as typeof fetch,
    );
    await expect(
      html.subject.load(PATH, {
        access: 'public',
        variant: 'detail',
        signal: new AbortController().signal,
      }),
    ).resolves.toBeNull();
    await expect(
      html.subject.load('portraits/secret-npc.webp', {
        access: 'public',
        variant: 'detail',
        signal: new AbortController().signal,
      }),
    ).resolves.toBeNull();
    denied.subject.destroy();
    html.subject.destroy();
  });

  it('caches URLs and revokes them when public/master authorization disappears', async () => {
    const fetchImplementation = vi.fn(async () => imageResponse()) as unknown as typeof fetch;
    const { subject, revokeObjectUrl } = resources(fetchImplementation);

    await subject.load(PATH, {
      access: 'public',
      variant: 'marker',
      signal: new AbortController().signal,
    });
    await subject.load(PATH, {
      access: 'public',
      variant: 'marker',
      signal: new AbortController().signal,
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);

    subject.retainPublicPaths(new Set());
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:portrait');

    await subject.load(PATH, {
      access: 'master',
      variant: 'detail',
      signal: new AbortController().signal,
    });
    subject.clearPrivate();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(2);
    subject.destroy();
  });
});
