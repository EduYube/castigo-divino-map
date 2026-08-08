import {
  PublicDataRepositoryError,
  type PublicCatalogEnvelope,
  type PublicCatalogRepository,
} from '../../data-access/publicCatalog';
import {
  fetchCompletePublicCatalogTable,
  PUBLIC_CATALOG_TABLE_QUERIES,
  PublicCatalogReadError,
  type PublicCatalogTableQuery,
} from '../../data-access/publicCatalogQueryContract.js';
import { buildPublicCatalogEnvelopeV2 } from './publicCatalogCodec';
import type { PublicCatalogTablePayloadsWithCharacterLocations } from './publicCharacterLocationRelations';

export { parsePublicCatalogSnapshotV2 } from './publicCatalogCodec';

const PROJECT_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const LOCAL_PROJECT_URL_PATTERN = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/i;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{10,}$/;
const LEGACY_ANON_KEY_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export interface SupabasePublicCatalogRepositoryOptions {
  readonly projectUrl: string;
  readonly publishableKey: string;
  readonly fetchImplementation?: typeof fetch;
  readonly now?: () => number;
  readonly allowLocalProject?: boolean;
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

    return (
      typeof payload === 'object' &&
      payload !== null &&
      !Array.isArray(payload) &&
      (payload as Record<string, unknown>).role === 'anon'
    );
  } catch {
    return false;
  }
}

function toRepositoryError(error: PublicCatalogReadError): PublicDataRepositoryError {
  return new PublicDataRepositoryError(error.kind, error.message, {
    source: 'supabase',
    status: error.status ?? undefined,
    cause: error,
  });
}

export class SupabasePublicCatalogRepository implements PublicCatalogRepository {
  readonly #projectUrl: string;
  readonly #publishableKey: string;
  readonly #fetchImplementation: typeof fetch;
  readonly #now: () => number;

  constructor(options: SupabasePublicCatalogRepositoryOptions) {
    const projectUrl = options.projectUrl.trim();
    const publishableKey = options.publishableKey.trim();
    const isLocalProject = LOCAL_PROJECT_URL_PATTERN.test(projectUrl);
    const validProjectUrl =
      PROJECT_URL_PATTERN.test(projectUrl) ||
      (options.allowLocalProject === true && isLocalProject);
    const validPublishableKey = PUBLISHABLE_KEY_PATTERN.test(publishableKey);
    const validLocalAnonKey =
      options.allowLocalProject === true && isLocalProject && isLegacyAnonKey(publishableKey);

    if (!projectUrl || !publishableKey) {
      throw new PublicDataRepositoryError(
        'configuration-missing',
        'Falta la URL o la clave publicable de Supabase.',
        { source: 'supabase', recoverable: false },
      );
    }

    if (!validProjectUrl) {
      throw new PublicDataRepositoryError(
        'configuration-invalid',
        'La URL pública de Supabase no tiene un formato permitido.',
        { source: 'supabase', recoverable: false },
      );
    }

    if (!validPublishableKey && !validLocalAnonKey) {
      throw new PublicDataRepositoryError(
        'configuration-invalid',
        'La configuración alojada requiere una clave sb_publishable_; una clave anon legacy solo se admite con Supabase local.',
        { source: 'supabase', recoverable: false },
      );
    }

    this.#projectUrl = projectUrl.replace(/\/$/, '');
    this.#publishableKey = publishableKey;
    this.#fetchImplementation = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
    this.#now = options.now ?? Date.now;
  }

  async #loadTable(
    query: PublicCatalogTableQuery,
    signal: AbortSignal,
  ): Promise<readonly Record<string, unknown>[]> {
    try {
      return await fetchCompletePublicCatalogTable({
        projectUrl: this.#projectUrl,
        publishableKey: this.#publishableKey,
        query,
        fetchImplementation: this.#fetchImplementation,
        signal,
      });
    } catch (error) {
      if (error instanceof PublicCatalogReadError) {
        throw toRepositoryError(error);
      }

      throw error;
    }
  }

  async load(options: { readonly signal: AbortSignal }): Promise<PublicCatalogEnvelope> {
    const controller = new AbortController();
    const handleParentAbort = (): void => controller.abort();

    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', handleParentAbort, { once: true });
    }

    try {
      const entries = Object.entries(PUBLIC_CATALOG_TABLE_QUERIES) as [
        keyof PublicCatalogTablePayloadsWithCharacterLocations,
        PublicCatalogTableQuery,
      ][];
      const responses = await Promise.all(
        entries.map(
          async ([key, query]) => [key, await this.#loadTable(query, controller.signal)] as const,
        ),
      );

      return await buildPublicCatalogEnvelopeV2(
        Object.fromEntries(
          responses,
        ) as unknown as PublicCatalogTablePayloadsWithCharacterLocations,
        this.#now,
      );
    } catch (error) {
      controller.abort();
      throw error;
    } finally {
      options.signal.removeEventListener('abort', handleParentAbort);
    }
  }
}
