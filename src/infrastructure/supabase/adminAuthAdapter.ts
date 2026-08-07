import {
  AuthGatewayError,
  type AdminAuthorizationGateway,
  type AuthCredentials,
  type AuthGateway,
  type AuthGatewayEvent,
  type AuthGatewayListener,
  type AuthIdentity,
} from '../../auth/authGateway';
import {
  AUTH_SESSION_STORAGE_KEY,
  BrowserAuthSessionStorage,
} from './authSessionStorage';

const HOSTED_PROJECT_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const LOCAL_PROJECT_URL_PATTERN = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/i;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{10,}$/;
const LEGACY_ANON_KEY_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const SESSION_VERSION = 1;
const REFRESH_EARLY_MS = 60_000;
const MIN_REFRESH_DELAY_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 8_000;

interface StoredAuthSessionV1 {
  readonly version: 1;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly userId: string;
  readonly email: string | null;
}

interface SupabaseAdminAuthAdapterOptions {
  readonly projectUrl: string;
  readonly publishableKey: string;
  readonly storage?: BrowserAuthSessionStorage;
  readonly fetchImplementation?: typeof fetch;
  readonly now?: () => number;
  readonly timeoutMs?: number;
  readonly allowLocalProject?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return globalThis.atob(padded);
}

function isLegacyAnonKey(value: string): boolean {
  if (!LEGACY_ANON_KEY_PATTERN.test(value)) {
    return false;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(value.split('.')[1] ?? '')) as unknown;
    return isRecord(payload) && payload.role === 'anon';
  } catch {
    return false;
  }
}

function normalizeProjectConfiguration(
  projectUrlInput: string,
  publishableKeyInput: string,
  allowLocalProject: boolean,
): { readonly projectUrl: string; readonly publishableKey: string } {
  const projectUrl = projectUrlInput.trim();
  const publishableKey = publishableKeyInput.trim();
  const isLocalProject = LOCAL_PROJECT_URL_PATTERN.test(projectUrl);

  if (!projectUrl || !publishableKey) {
    throw new AuthGatewayError(
      'configuration-missing',
      'Supabase administrative authentication configuration is missing.',
    );
  }

  if (
    !HOSTED_PROJECT_URL_PATTERN.test(projectUrl) &&
    !(allowLocalProject && isLocalProject)
  ) {
    throw new AuthGatewayError(
      'configuration-invalid',
      'Supabase administrative authentication URL is not allowed.',
    );
  }

  const validPublishableKey = PUBLISHABLE_KEY_PATTERN.test(publishableKey);
  const validLocalAnonKey =
    allowLocalProject && isLocalProject && isLegacyAnonKey(publishableKey);

  if (!validPublishableKey && !validLocalAnonKey) {
    throw new AuthGatewayError(
      'configuration-invalid',
      'Supabase administrative authentication key is not allowed.',
    );
  }

  return {
    projectUrl: projectUrl.replace(/\/$/, ''),
    publishableKey,
  };
}

function parseStoredSession(value: unknown): StoredAuthSessionV1 | null {
  if (!isRecord(value) || value.version !== SESSION_VERSION) {
    return null;
  }

  const { accessToken, refreshToken, expiresAt, userId, email } = value;

  if (
    typeof accessToken !== 'string' ||
    accessToken.length === 0 ||
    typeof refreshToken !== 'string' ||
    refreshToken.length === 0 ||
    typeof expiresAt !== 'number' ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= 0 ||
    typeof userId !== 'string' ||
    userId.length === 0 ||
    (email !== null && typeof email !== 'string')
  ) {
    return null;
  }

  return {
    version: SESSION_VERSION,
    accessToken,
    refreshToken,
    expiresAt,
    userId,
    email,
  };
}

function parseAuthSessionPayload(value: unknown, now: () => number): StoredAuthSessionV1 | null {
  if (!isRecord(value) || !isRecord(value.user)) {
    return null;
  }

  const accessToken = value.access_token;
  const refreshToken = value.refresh_token;
  const expiresAtValue = value.expires_at;
  const expiresInValue = value.expires_in;
  const userId = value.user.id;
  const emailValue = value.user.email;
  const expiresAt =
    typeof expiresAtValue === 'number' && Number.isFinite(expiresAtValue)
      ? expiresAtValue
      : typeof expiresInValue === 'number' && Number.isFinite(expiresInValue)
        ? Math.floor(now() / 1000) + expiresInValue
        : null;

  if (
    typeof accessToken !== 'string' ||
    accessToken.length === 0 ||
    typeof refreshToken !== 'string' ||
    refreshToken.length === 0 ||
    expiresAt === null ||
    expiresAt <= 0 ||
    typeof userId !== 'string' ||
    userId.length === 0 ||
    (emailValue !== undefined && emailValue !== null && typeof emailValue !== 'string')
  ) {
    return null;
  }

  return {
    version: SESSION_VERSION,
    accessToken,
    refreshToken,
    expiresAt,
    userId,
    email: typeof emailValue === 'string' ? emailValue : null,
  };
}

function toIdentity(session: StoredAuthSessionV1): AuthIdentity {
  return {
    userId: session.userId,
    email: session.email,
    expiresAt: session.expiresAt,
  };
}

function getErrorCode(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  return typeof value.code === 'string' ? value.code : null;
}

export class SupabaseAdminAuthAdapter implements AuthGateway, AdminAuthorizationGateway {
  readonly #projectUrl: string;
  readonly #publishableKey: string;
  readonly #storage: BrowserAuthSessionStorage;
  readonly #fetchImplementation: typeof fetch;
  readonly #now: () => number;
  readonly #timeoutMs: number;
  readonly #listeners = new Set<AuthGatewayListener>();

  #session: StoredAuthSessionV1 | null = null;
  #refreshTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  #disposed = false;

  constructor(options: SupabaseAdminAuthAdapterOptions) {
    const configuration = normalizeProjectConfiguration(
      options.projectUrl,
      options.publishableKey,
      options.allowLocalProject === true,
    );

    this.#projectUrl = configuration.projectUrl;
    this.#publishableKey = configuration.publishableKey;
    this.#storage = options.storage ?? new BrowserAuthSessionStorage();
    this.#fetchImplementation = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
    this.#now = options.now ?? Date.now;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#storage.assertAvailable();
  }

  async signIn(credentials: AuthCredentials): Promise<AuthIdentity> {
    this.#assertActive();
    const email = credentials.email.trim();

    if (!email || !credentials.password) {
      throw new AuthGatewayError('invalid-credentials', 'Password sign-in was rejected.');
    }

    const response = await this.#request(
      `${this.#projectUrl}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: this.#publicJsonHeaders(),
        body: JSON.stringify({ email, password: credentials.password }),
      },
      'sign-in',
    );
    const payload = await this.#readJson(response);

    if (!response.ok) {
      throw this.#normalizeAuthError(response.status, getErrorCode(payload), 'sign-in');
    }

    const session = parseAuthSessionPayload(payload, this.#now);

    if (!session) {
      throw new AuthGatewayError(
        'invalid-response',
        'Supabase Auth returned an invalid password sign-in response.',
      );
    }

    this.#adoptSession(session);
    const identity = toIdentity(session);
    this.#emit({ type: 'signed-in', identity });
    return identity;
  }

  async restoreSession(): Promise<AuthIdentity | null> {
    this.#assertActive();
    const session = this.#readStoredSession();

    if (!session) {
      return null;
    }

    this.#session = session;

    if (session.expiresAt * 1000 <= this.#now() + REFRESH_EARLY_MS) {
      return this.#refreshSession(false);
    }

    this.#scheduleRefresh(session);
    return toIdentity(session);
  }

  async refreshSession(): Promise<AuthIdentity> {
    return this.#refreshSession(false);
  }

  async signOut(): Promise<void> {
    this.#assertActive();
    const session = this.#session ?? this.#readStoredSession();
    const accessToken = session?.accessToken ?? null;

    this.#clearLocalSession();
    this.#emit({ type: 'signed-out', identity: null });

    if (!accessToken) {
      return;
    }

    let response: Response;

    try {
      response = await this.#request(
        `${this.#projectUrl}/auth/v1/logout?scope=local`,
        {
          method: 'POST',
          headers: {
            apikey: this.#publishableKey,
            Authorization: `Bearer ${accessToken}`,
          },
        },
        'logout',
      );
    } catch (error) {
      throw error instanceof AuthGatewayError && error.code === 'request-timeout'
        ? new AuthGatewayError('logout-failed', 'Supabase Auth local sign-out timed out.')
        : new AuthGatewayError('logout-failed', 'Supabase Auth local sign-out failed.');
    }

    if (!response.ok && response.status !== 401 && response.status !== 403) {
      throw new AuthGatewayError(
        'logout-failed',
        'Supabase Auth rejected local sign-out.',
        response.status,
      );
    }
  }

  onAuthStateChange(listener: AuthGatewayListener): () => void {
    this.#assertActive();
    this.#listeners.add(listener);

    queueMicrotask(() => {
      if (this.#listeners.has(listener) && !this.#disposed) {
        listener({
          type: 'initial-session',
          identity: this.#session ? toIdentity(this.#session) : null,
        });
      }
    });

    return (): void => {
      this.#listeners.delete(listener);
    };
  }

  async isCurrentUserAdmin(): Promise<boolean> {
    this.#assertActive();
    const session = this.#session;

    if (!session) {
      throw new AuthGatewayError('session-absent', 'No session is available for authorization.');
    }

    const response = await this.#request(
      `${this.#projectUrl}/rest/v1/rpc/current_user_is_admin`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          apikey: this.#publishableKey,
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
      'authorization',
    );

    if (response.status === 401) {
      throw new AuthGatewayError(
        'session-expired',
        'Administrative authorization rejected an expired session.',
        401,
      );
    }

    if (response.status === 403) {
      throw new AuthGatewayError(
        'forbidden',
        'Administrative authorization was forbidden.',
        403,
      );
    }

    if (!response.ok) {
      throw new AuthGatewayError(
        response.status >= 500 ? 'network-unavailable' : 'unexpected',
        'Administrative authorization request failed.',
        response.status,
      );
    }

    const payload = await this.#readJson(response);

    if (typeof payload !== 'boolean') {
      throw new AuthGatewayError(
        'invalid-response',
        'Administrative authorization returned an invalid response.',
      );
    }

    return payload;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    this.#clearRefreshTimer();
    this.#listeners.clear();
  }

  async #refreshSession(emitEvent: boolean): Promise<AuthIdentity> {
    this.#assertActive();
    const existingSession = this.#session ?? this.#readStoredSession();

    if (!existingSession) {
      throw new AuthGatewayError('session-absent', 'No session is available to refresh.');
    }

    const response = await this.#request(
      `${this.#projectUrl}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: this.#publicJsonHeaders(),
        body: JSON.stringify({ refresh_token: existingSession.refreshToken }),
      },
      'refresh',
    );
    const payload = await this.#readJson(response);

    if (!response.ok) {
      throw this.#normalizeAuthError(response.status, getErrorCode(payload), 'refresh');
    }

    const session = parseAuthSessionPayload(payload, this.#now);

    if (!session) {
      throw new AuthGatewayError(
        'invalid-response',
        'Supabase Auth returned an invalid refresh response.',
      );
    }

    this.#adoptSession(session);
    const identity = toIdentity(session);

    if (emitEvent) {
      this.#emit({ type: 'token-refreshed', identity });
    }

    return identity;
  }

  #adoptSession(session: StoredAuthSessionV1): void {
    this.#session = session;
    this.#storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
    this.#scheduleRefresh(session);
  }

  #readStoredSession(): StoredAuthSessionV1 | null {
    const serialized = this.#storage.getItem(AUTH_SESSION_STORAGE_KEY);

    if (!serialized) {
      return null;
    }

    try {
      const parsed = parseStoredSession(JSON.parse(serialized));

      if (!parsed) {
        this.#storage.removeItem(AUTH_SESSION_STORAGE_KEY);
        throw new AuthGatewayError(
          'invalid-response',
          'Stored administrative authentication data is invalid.',
        );
      }

      return parsed;
    } catch (error) {
      if (error instanceof AuthGatewayError) {
        throw error;
      }

      this.#storage.removeItem(AUTH_SESSION_STORAGE_KEY);
      throw new AuthGatewayError(
        'invalid-response',
        'Stored administrative authentication data could not be parsed.',
      );
    }
  }

  #scheduleRefresh(session: StoredAuthSessionV1): void {
    this.#clearRefreshTimer();
    const delay = Math.max(
      MIN_REFRESH_DELAY_MS,
      session.expiresAt * 1000 - this.#now() - REFRESH_EARLY_MS,
    );

    this.#refreshTimer = globalThis.setTimeout(() => {
      void this.#handleAutomaticRefresh();
    }, delay);
  }

  async #handleAutomaticRefresh(): Promise<void> {
    if (this.#disposed || !this.#session) {
      return;
    }

    try {
      const identity = await this.#refreshSession(true);
      this.#emit({ type: 'token-refreshed', identity });
    } catch {
      try {
        this.#clearLocalSession();
      } catch {
        this.#session = null;
        this.#clearRefreshTimer();
      }
      this.#emit({ type: 'refresh-failed', identity: null });
    }
  }

  #clearLocalSession(): void {
    this.#session = null;
    this.#clearRefreshTimer();
    this.#storage.removeItem(AUTH_SESSION_STORAGE_KEY);
  }

  #clearRefreshTimer(): void {
    if (this.#refreshTimer !== null) {
      globalThis.clearTimeout(this.#refreshTimer);
      this.#refreshTimer = null;
    }
  }

  #emit(event: AuthGatewayEvent): void {
    if (this.#disposed) {
      return;
    }

    for (const listener of this.#listeners) {
      listener(event);
    }
  }

  #publicJsonHeaders(): HeadersInit {
    return {
      Accept: 'application/json',
      apikey: this.#publishableKey,
      'Content-Type': 'application/json',
    };
  }

  async #request(
    input: string,
    init: RequestInit,
    operation: 'sign-in' | 'refresh' | 'logout' | 'authorization',
  ): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#timeoutMs);

    try {
      return await this.#fetchImplementation(input, { ...init, signal: controller.signal });
    } catch {
      if (timedOut) {
        throw new AuthGatewayError(
          'request-timeout',
          `Supabase ${operation} request timed out.`,
        );
      }

      throw new AuthGatewayError(
        'network-unavailable',
        `Supabase ${operation} request could not reach the service.`,
      );
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  async #readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      if (response.ok) {
        throw new AuthGatewayError(
          'invalid-response',
          'Supabase Auth returned invalid JSON.',
          response.status,
        );
      }

      return null;
    }
  }

  #normalizeAuthError(
    status: number,
    code: string | null,
    operation: 'sign-in' | 'refresh',
  ): AuthGatewayError {
    if (operation === 'sign-in') {
      if (
        code === 'invalid_credentials' ||
        code === 'email_not_confirmed' ||
        code === 'user_not_found' ||
        status === 400
      ) {
        return new AuthGatewayError('invalid-credentials', 'Password sign-in was rejected.', status);
      }
    } else if (
      code === 'refresh_token_already_used' ||
      code === 'refresh_token_not_found' ||
      code === 'session_expired' ||
      code === 'session_not_found' ||
      status === 401
    ) {
      return new AuthGatewayError('refresh-failed', 'Session refresh was rejected.', status);
    }

    if (code === 'request_timeout' || status === 408) {
      return new AuthGatewayError('request-timeout', 'Supabase Auth request timed out.', status);
    }

    if (status >= 500 || status === 429) {
      return new AuthGatewayError(
        'network-unavailable',
        'Supabase Auth is temporarily unavailable.',
        status,
      );
    }

    return new AuthGatewayError('unexpected', 'Supabase Auth request failed.', status);
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new AuthGatewayError('unexpected', 'Authentication adapter has been disposed.');
    }
  }
}
