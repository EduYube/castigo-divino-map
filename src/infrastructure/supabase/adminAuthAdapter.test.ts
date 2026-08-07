import { afterEach, describe, expect, test, vi } from 'vitest';

import { AuthGatewayError, type AuthGatewayEvent } from '../../auth/authGateway';
import { SupabaseAdminAuthAdapter } from './adminAuthAdapter';
import { AUTH_SESSION_STORAGE_KEY, BrowserAuthSessionStorage } from './authSessionStorage';

const PROJECT_URL = 'http://127.0.0.1:54321';
const PUBLISHABLE_KEY = 'sb_publishable_map017_test_key';
const NOW_MS = Date.parse('2026-08-07T08:00:00.000Z');
const ACCESS_TOKEN = 'map017_access_token';
const REFRESH_TOKEN = 'map017_refresh_token';

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
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function sessionPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    access_token: ACCESS_TOKEN,
    refresh_token: REFRESH_TOKEN,
    expires_in: 3600,
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'admin@example.invalid',
    },
    ...overrides,
  };
}

function createAdapter(
  fetchImplementation: typeof fetch,
  storage = new MemoryStorage(),
): { readonly adapter: SupabaseAdminAuthAdapter; readonly storage: MemoryStorage } {
  return {
    adapter: new SupabaseAdminAuthAdapter({
      projectUrl: PROJECT_URL,
      publishableKey: PUBLISHABLE_KEY,
      storage: new BrowserAuthSessionStorage(storage),
      fetchImplementation,
      now: () => NOW_MS,
      allowLocalProject: true,
      timeoutMs: 500,
    }),
    storage,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SupabaseAdminAuthAdapter', () => {
  test('uses the password grant and keeps session tokens inside the Auth adapter storage', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    const fetchImplementation: typeof fetch = async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return jsonResponse(sessionPayload());
    };
    const { adapter, storage } = createAdapter(fetchImplementation);

    const identity = await adapter.signIn({
      email: ' admin@example.invalid ',
      password: 'test-password',
    });

    expect(requestUrl).toBe(`${PROJECT_URL}/auth/v1/token?grant_type=password`);
    expect(new Headers(requestInit?.headers).get('apikey')).toBe(PUBLISHABLE_KEY);
    expect(new Headers(requestInit?.headers).get('authorization')).toBeNull();
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      email: 'admin@example.invalid',
      password: 'test-password',
    });
    expect(identity).toEqual({
      userId: '00000000-0000-4000-8000-000000000001',
      email: 'admin@example.invalid',
      expiresAt: Math.floor(NOW_MS / 1000) + 3600,
    });
    expect(JSON.stringify(identity)).not.toContain(ACCESS_TOKEN);
    expect(storage.getItem(AUTH_SESSION_STORAGE_KEY)).toContain(ACCESS_TOKEN);
    adapter.dispose();
  });

  test('restores a valid session from the tab-scoped storage without a network request', async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        accessToken: ACCESS_TOKEN,
        refreshToken: REFRESH_TOKEN,
        expiresAt: Math.floor(NOW_MS / 1000) + 3600,
        userId: '00000000-0000-4000-8000-000000000001',
        email: 'admin@example.invalid',
      }),
    );
    let requests = 0;
    const fetchImplementation: typeof fetch = async () => {
      requests += 1;
      throw new Error('network should not be used');
    };
    const { adapter } = createAdapter(fetchImplementation, storage);

    await expect(adapter.restoreSession()).resolves.toMatchObject({
      userId: '00000000-0000-4000-8000-000000000001',
    });
    expect(requests).toBe(0);
    adapter.dispose();
  });

  test('refreshes an expiring restored session and rotates the stored refresh token', async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        accessToken: ACCESS_TOKEN,
        refreshToken: REFRESH_TOKEN,
        expiresAt: Math.floor(NOW_MS / 1000) + 10,
        userId: '00000000-0000-4000-8000-000000000001',
        email: 'admin@example.invalid',
      }),
    );
    const fetchImplementation: typeof fetch = async (input, init) => {
      expect(String(input)).toBe(`${PROJECT_URL}/auth/v1/token?grant_type=refresh_token`);
      expect(JSON.parse(String(init?.body))).toEqual({ refresh_token: REFRESH_TOKEN });
      return jsonResponse(
        sessionPayload({
          access_token: 'map017_rotated_access_token',
          refresh_token: 'map017_rotated_refresh_token',
        }),
      );
    };
    const { adapter } = createAdapter(fetchImplementation, storage);

    await adapter.restoreSession();

    const persisted = storage.getItem(AUTH_SESSION_STORAGE_KEY) ?? '';
    expect(persisted).toContain('map017_rotated_refresh_token');
    expect(persisted).not.toContain(`"refreshToken":"${REFRESH_TOKEN}"`);
    adapter.dispose();
  });

  test('normalizes invalid credentials without retaining server detail', async () => {
    const fetchImplementation: typeof fetch = async () =>
      jsonResponse({ code: 'invalid_credentials', message: 'sensitive server detail' }, 400);
    const { adapter } = createAdapter(fetchImplementation);

    await expect(
      adapter.signIn({ email: 'unknown@example.invalid', password: 'wrong-password' }),
    ).rejects.toMatchObject({ code: 'invalid-credentials', status: 400 });

    try {
      await adapter.signIn({ email: 'unknown@example.invalid', password: 'wrong-password' });
    } catch (error) {
      expect(error).toBeInstanceOf(AuthGatewayError);
      expect(String(error)).not.toContain('sensitive server detail');
      expect(String(error)).not.toContain('wrong-password');
    }
    adapter.dispose();
  });

  test('maps invalid refresh tokens to refresh-failed', async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        accessToken: ACCESS_TOKEN,
        refreshToken: REFRESH_TOKEN,
        expiresAt: Math.floor(NOW_MS / 1000) + 10,
        userId: '00000000-0000-4000-8000-000000000001',
        email: null,
      }),
    );
    const fetchImplementation: typeof fetch = async () =>
      jsonResponse({ code: 'refresh_token_not_found' }, 400);
    const { adapter } = createAdapter(fetchImplementation, storage);

    await expect(adapter.restoreSession()).rejects.toMatchObject({ code: 'refresh-failed' });
    adapter.dispose();
  });

  test('checks administrator status through the minimal RPC with the session token', async () => {
    const requests: Array<{ url: string; headers: Headers }> = [];
    const fetchImplementation: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, headers: new Headers(init?.headers) });

      if (url.includes('/auth/v1/token')) {
        return jsonResponse(sessionPayload());
      }

      return jsonResponse(true);
    };
    const { adapter } = createAdapter(fetchImplementation);
    await adapter.signIn({ email: 'admin@example.invalid', password: 'test-password' });

    await expect(adapter.isCurrentUserAdmin()).resolves.toBe(true);

    const authorizationRequest = requests.at(-1);
    expect(authorizationRequest?.url).toBe(`${PROJECT_URL}/rest/v1/rpc/current_user_is_admin`);
    expect(authorizationRequest?.headers.get('apikey')).toBe(PUBLISHABLE_KEY);
    expect(authorizationRequest?.headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
    adapter.dispose();
  });

  test('treats 401 and 403 role checks as safe session or authorization loss', async () => {
    for (const [status, code] of [
      [401, 'session-expired'],
      [403, 'forbidden'],
    ] as const) {
      const fetchImplementation: typeof fetch = async (input) =>
        String(input).includes('/auth/v1/token')
          ? jsonResponse(sessionPayload())
          : jsonResponse({}, status);
      const { adapter } = createAdapter(fetchImplementation);
      await adapter.signIn({ email: 'admin@example.invalid', password: 'test-password' });

      await expect(adapter.isCurrentUserAdmin()).rejects.toMatchObject({ code, status });
      adapter.dispose();
    }
  });

  test('clears the local session before requesting a local-scope sign-out', async () => {
    const storage = new MemoryStorage();
    let logoutUrl = '';
    let wasClearedBeforeRemoteLogout = false;
    const fetchImplementation: typeof fetch = async (input) => {
      const url = String(input);

      if (url.includes('/auth/v1/token')) {
        return jsonResponse(sessionPayload());
      }

      logoutUrl = url;
      wasClearedBeforeRemoteLogout = storage.getItem(AUTH_SESSION_STORAGE_KEY) === null;
      return new Response(null, { status: 204 });
    };
    const { adapter } = createAdapter(fetchImplementation, storage);
    await adapter.signIn({ email: 'admin@example.invalid', password: 'test-password' });

    await adapter.signOut();

    expect(logoutUrl).toBe(`${PROJECT_URL}/auth/v1/logout?scope=local`);
    expect(wasClearedBeforeRemoteLogout).toBe(true);
    expect(storage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    adapter.dispose();
  });

  test('emits refresh-failed and clears storage when automatic refresh is rejected', async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    let requestCount = 0;
    const events: AuthGatewayEvent[] = [];
    const fetchImplementation: typeof fetch = async () => {
      requestCount += 1;
      return requestCount === 1
        ? jsonResponse(sessionPayload({ expires_in: 61 }))
        : jsonResponse({ code: 'refresh_token_not_found' }, 400);
    };
    const { adapter } = createAdapter(fetchImplementation, storage);
    adapter.onAuthStateChange((event) => events.push(event));
    await adapter.signIn({ email: 'admin@example.invalid', password: 'test-password' });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(events.some((event) => event.type === 'refresh-failed')).toBe(true);
    expect(storage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    adapter.dispose();
  });

  test('normalizes transport failures without leaking request data', async () => {
    const fetchImplementation: typeof fetch = async () => {
      throw new Error(`failed with ${ACCESS_TOKEN}`);
    };
    const { adapter } = createAdapter(fetchImplementation);

    await expect(
      adapter.signIn({ email: 'admin@example.invalid', password: 'test-password' }),
    ).rejects.toMatchObject({ code: 'network-unavailable' });

    try {
      await adapter.signIn({ email: 'admin@example.invalid', password: 'test-password' });
    } catch (error) {
      expect(String(error)).not.toContain(ACCESS_TOKEN);
      expect(String(error)).not.toContain('test-password');
    }
    adapter.dispose();
  });
});
