import { AUTH_SESSION_STORAGE_KEY, BrowserAuthSessionStorage } from './authSessionStorage';

const HOSTED_PROJECT_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const LOCAL_PROJECT_URL_PATTERN = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/i;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{10,}$/;
const LEGACY_ANON_KEY_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const PORTRAIT_PATH_PATTERN =
  /^portraits\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MARKER_RENDER_SIZE = 96;
const DEFAULT_TIMEOUT_MS = 8_000;

export type CharacterPortraitAccess = 'public' | 'master';
export type CharacterPortraitVariant = 'marker' | 'detail';

export interface CharacterPortraitLoadOptions {
  readonly access: CharacterPortraitAccess;
  readonly variant: CharacterPortraitVariant;
  readonly signal: AbortSignal;
}

export interface CharacterPortraitResources {
  load(path: string, options: CharacterPortraitLoadOptions): Promise<string | null>;
  retainPublicPaths(paths: ReadonlySet<string>): void;
  retainMasterPaths(paths: ReadonlySet<string>): void;
  clearPrivate(): void;
  destroy(): void;
}

interface CharacterPortraitResourcesOptions {
  readonly projectUrl: string;
  readonly publishableKey: string;
  readonly storage?: BrowserAuthSessionStorage;
  readonly fetchImplementation?: typeof fetch;
  readonly timeoutMs?: number;
  readonly now?: () => number;
  readonly allowLocalProject?: boolean;
  readonly createObjectUrl?: (blob: Blob) => string;
  readonly revokeObjectUrl?: (url: string) => void;
}

interface CachedPortrait {
  readonly path: string;
  readonly access: CharacterPortraitAccess;
  readonly variant: CharacterPortraitVariant;
  readonly url: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return globalThis.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
}

function isLegacyAnonKey(value: string): boolean {
  if (!LEGACY_ANON_KEY_PATTERN.test(value)) return false;
  try {
    const payload = JSON.parse(decodeBase64Url(value.split('.')[1] ?? '')) as unknown;
    return isRecord(payload) && payload.role === 'anon';
  } catch {
    return false;
  }
}

function encodeStoragePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function cacheKey(
  path: string,
  access: CharacterPortraitAccess,
  variant: CharacterPortraitVariant,
): string {
  return `${access}\u0000${variant}\u0000${path}`;
}

export class SupabaseCharacterPortraitResources implements CharacterPortraitResources {
  readonly #projectUrl: string;
  readonly #publishableKey: string;
  readonly #storage: BrowserAuthSessionStorage;
  readonly #fetchImplementation: typeof fetch;
  readonly #timeoutMs: number;
  readonly #now: () => number;
  readonly #createObjectUrl: (blob: Blob) => string;
  readonly #revokeObjectUrl: (url: string) => void;
  readonly #cache = new Map<string, CachedPortrait>();
  #destroyed = false;

  constructor(options: CharacterPortraitResourcesOptions) {
    const projectUrl = options.projectUrl.trim();
    const publishableKey = options.publishableKey.trim();
    const isLocalProject = LOCAL_PROJECT_URL_PATTERN.test(projectUrl);
    const validUrl =
      HOSTED_PROJECT_URL_PATTERN.test(projectUrl) ||
      (options.allowLocalProject === true && isLocalProject);
    const validKey =
      PUBLISHABLE_KEY_PATTERN.test(publishableKey) ||
      (options.allowLocalProject === true && isLocalProject && isLegacyAnonKey(publishableKey));

    if (!projectUrl || !publishableKey || !validUrl || !validKey) {
      throw new Error('La configuración de retratos de personajes no está disponible.');
    }

    this.#projectUrl = projectUrl.replace(/\/$/, '');
    this.#publishableKey = publishableKey;
    this.#storage = options.storage ?? new BrowserAuthSessionStorage();
    this.#fetchImplementation = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#now = options.now ?? Date.now;
    this.#createObjectUrl = options.createObjectUrl ?? URL.createObjectURL.bind(URL);
    this.#revokeObjectUrl = options.revokeObjectUrl ?? URL.revokeObjectURL.bind(URL);
  }

  async load(path: string, options: CharacterPortraitLoadOptions): Promise<string | null> {
    if (this.#destroyed || options.signal.aborted || !PORTRAIT_PATH_PATTERN.test(path)) return null;

    const key = cacheKey(path, options.access, options.variant);
    const cached = this.#cache.get(key);
    if (cached) return cached.url;

    const accessToken = options.access === 'master' ? this.#readAdministrativeAccessToken() : null;
    if (options.access === 'master' && !accessToken) {
      this.clearPrivate();
      return null;
    }

    const encodedPath = encodeStoragePath(path);
    const objectUrl = new URL(
      `${this.#projectUrl}/storage/v1/object/authenticated/character-portraits/${encodedPath}`,
    );
    const candidateUrls: URL[] = [];
    if (options.variant === 'marker') {
      const renderUrl = new URL(
        `${this.#projectUrl}/storage/v1/render/image/authenticated/character-portraits/${encodedPath}`,
      );
      renderUrl.searchParams.set('width', String(MARKER_RENDER_SIZE));
      renderUrl.searchParams.set('height', String(MARKER_RENDER_SIZE));
      renderUrl.searchParams.set('resize', 'cover');
      renderUrl.searchParams.set('quality', '72');
      candidateUrls.push(renderUrl, objectUrl);
    } else {
      candidateUrls.push(objectUrl);
    }

    const requestController = new AbortController();
    const abortRequest = (): void => requestController.abort();
    if (options.signal.aborted) requestController.abort();
    else options.signal.addEventListener('abort', abortRequest, { once: true });
    const timeout = globalThis.setTimeout(() => requestController.abort(), this.#timeoutMs);

    try {
      let finalStatus: number | null = null;
      for (const url of candidateUrls) {
        if (requestController.signal.aborted || options.signal.aborted) return null;

        let response: Response;
        try {
          response = await this.#fetchImplementation(url, {
            method: 'GET',
            headers: {
              Accept: 'image/jpeg,image/png,image/webp',
              apikey: this.#publishableKey,
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            cache: 'no-store',
            signal: requestController.signal,
          });
        } catch {
          continue;
        }
        finalStatus = response.status;
        if (!response.ok) continue;

        const contentType = response.headers
          .get('content-type')
          ?.split(';', 1)[0]
          ?.trim()
          .toLowerCase();
        if (!contentType || !ACCEPTED_IMAGE_TYPES.has(contentType)) continue;

        let blob: Blob;
        try {
          blob = await response.blob();
        } catch {
          continue;
        }
        if (blob.size === 0 || blob.size > MAX_RESPONSE_BYTES) continue;
        if (this.#destroyed || requestController.signal.aborted || options.signal.aborted)
          return null;

        const portraitUrl = this.#createObjectUrl(blob);
        const entry: CachedPortrait = {
          path,
          access: options.access,
          variant: options.variant,
          url: portraitUrl,
        };
        this.#cache.set(key, entry);
        return portraitUrl;
      }

      if (options.access === 'master' && (finalStatus === 401 || finalStatus === 403)) {
        this.clearPrivate();
      }
      return null;
    } finally {
      globalThis.clearTimeout(timeout);
      options.signal.removeEventListener('abort', abortRequest);
    }
  }

  retainPublicPaths(paths: ReadonlySet<string>): void {
    this.#retainPaths('public', paths);
  }

  retainMasterPaths(paths: ReadonlySet<string>): void {
    this.#retainPaths('master', paths);
  }

  clearPrivate(): void {
    this.#retainPaths('master', new Set());
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const entry of this.#cache.values()) this.#revokeObjectUrl(entry.url);
    this.#cache.clear();
  }

  #retainPaths(access: CharacterPortraitAccess, paths: ReadonlySet<string>): void {
    for (const [key, entry] of this.#cache) {
      if (entry.access !== access || paths.has(entry.path)) continue;
      this.#revokeObjectUrl(entry.url);
      this.#cache.delete(key);
    }
  }

  #readAdministrativeAccessToken(): string | null {
    let serialized: string | null;
    try {
      serialized = this.#storage.getItem(AUTH_SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
    if (!serialized) return null;

    try {
      const parsed = JSON.parse(serialized) as unknown;
      if (
        !isRecord(parsed) ||
        parsed.version !== 1 ||
        typeof parsed.accessToken !== 'string' ||
        parsed.accessToken.length === 0 ||
        typeof parsed.expiresAt !== 'number' ||
        parsed.expiresAt * 1000 <= this.#now()
      ) {
        return null;
      }
      return parsed.accessToken;
    } catch {
      return null;
    }
  }
}
