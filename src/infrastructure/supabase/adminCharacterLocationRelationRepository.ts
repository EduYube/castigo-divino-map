import {
  AdminCharacterLocationRelationRepositoryError,
  type AdminCharacterLocationRelationRepository,
} from '../../data-access/adminCharacterLocationRelations';
import type {
  AdminCharacterLocationRelationDraft,
  AdminCharacterLocationRelationRecord,
  AdminCharacterLocationRelationReferences,
  CharacterLocationEntityReference,
  CharacterLocationRelationPublicationStatus,
  CharacterLocationRelationStatus,
} from '../../domain/characterLocationRelations';
import { AUTH_SESSION_STORAGE_KEY, BrowserAuthSessionStorage } from './authSessionStorage';

const HOSTED_PROJECT_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const LOCAL_PROJECT_URL_PATTERN = /^http:\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/i;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{10,}$/;
const LEGACY_ANON_KEY_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const DEFAULT_TIMEOUT_MS = 8_000;

export interface SupabaseAdminCharacterLocationRelationRepositoryOptions {
  readonly projectUrl: string;
  readonly publishableKey: string;
  readonly storage?: BrowserAuthSessionStorage;
  readonly fetchImplementation?: typeof fetch;
  readonly timeoutMs?: number;
  readonly now?: () => number;
  readonly allowLocalProject?: boolean;
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

function requiredString(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AdminCharacterLocationRelationRepositoryError(
      'invalid-response',
      'Supabase devolvió una relación no válida.',
    );
  }
  return value;
}

function nullableString(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new AdminCharacterLocationRelationRepositoryError(
      'invalid-response',
      'Supabase devolvió metadatos de relación no válidos.',
    );
  }
  return value;
}

function relationStatus(value: unknown): CharacterLocationRelationStatus {
  if (value === 'present' || value === 'associated' || value === 'last-seen') return value;
  throw new AdminCharacterLocationRelationRepositoryError(
    'invalid-response',
    'Supabase devolvió un estado de relación no válido.',
  );
}

function publicationStatus(value: unknown): CharacterLocationRelationPublicationStatus {
  if (value === 'draft' || value === 'published' || value === 'archived') return value;
  throw new AdminCharacterLocationRelationRepositoryError(
    'invalid-response',
    'Supabase devolvió un estado editorial no válido.',
  );
}

function mapRelation(value: unknown): AdminCharacterLocationRelationRecord {
  if (!isRecord(value)) {
    throw new AdminCharacterLocationRelationRepositoryError(
      'invalid-response',
      'Supabase devolvió una relación no válida.',
    );
  }
  return {
    characterId: requiredString(value, 'character_id'),
    locationId: requiredString(value, 'location_id'),
    relationStatus: relationStatus(value.relation_status),
    publicationStatus: publicationStatus(value.publication_status),
    publishedAt: nullableString(value, 'published_at'),
    archivedAt: nullableString(value, 'archived_at'),
    updatedAt: requiredString(value, 'updated_at'),
  };
}

function mapReference(value: unknown): CharacterLocationEntityReference {
  if (!isRecord(value)) {
    throw new AdminCharacterLocationRelationRepositoryError(
      'invalid-response',
      'Supabase devolvió una referencia de entidad no válida.',
    );
  }
  const entityType = value.entity_type;
  if (entityType !== 'character' && entityType !== 'location') {
    throw new AdminCharacterLocationRelationRepositoryError(
      'invalid-response',
      'Supabase devolvió un tipo de entidad no válido.',
    );
  }
  return {
    id: requiredString(value, 'id'),
    name: requiredString(value, 'name'),
    entityType,
    publicationStatus: publicationStatus(value.publication_status),
  };
}

function responseCode(payload: unknown): string | null {
  return isRecord(payload) && typeof payload.code === 'string' ? payload.code : null;
}

const RELATION_SELECT =
  'character_id,location_id,relation_status,publication_status,published_at,archived_at,updated_at';

export class SupabaseAdminCharacterLocationRelationRepository
  implements AdminCharacterLocationRelationRepository
{
  readonly #projectUrl: string;
  readonly #publishableKey: string;
  readonly #storage: BrowserAuthSessionStorage;
  readonly #fetchImplementation: typeof fetch;
  readonly #timeoutMs: number;
  readonly #now: () => number;

  constructor(options: SupabaseAdminCharacterLocationRelationRepositoryOptions) {
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
      throw new AdminCharacterLocationRelationRepositoryError(
        'backend-unavailable',
        'El editor de relaciones no está configurado.',
      );
    }
    this.#projectUrl = projectUrl.replace(/\/$/, '');
    this.#publishableKey = publishableKey;
    this.#storage = options.storage ?? new BrowserAuthSessionStorage();
    this.#fetchImplementation = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#now = options.now ?? Date.now;
    this.#storage.assertAvailable();
  }

  async list(options: {
    readonly signal: AbortSignal;
  }): Promise<readonly AdminCharacterLocationRelationRecord[]> {
    const url = this.#tableUrl('character_location_relations');
    url.searchParams.set('select', RELATION_SELECT);
    url.searchParams.set('order', 'location_id.asc,character_id.asc');
    const payload = await this.#requestJson(url, { method: 'GET' }, options.signal);
    if (!Array.isArray(payload)) this.#invalidCollection();
    return payload.map(mapRelation);
  }

  async loadReferences(options: {
    readonly signal: AbortSignal;
  }): Promise<AdminCharacterLocationRelationReferences> {
    const url = this.#tableUrl('map_entities');
    url.searchParams.set('select', 'id,name,entity_type,publication_status');
    url.searchParams.set('order', 'name.asc,id.asc');
    const payload = await this.#requestJson(url, { method: 'GET' }, options.signal);
    if (!Array.isArray(payload)) this.#invalidCollection();
    const references = payload.map(mapReference);
    return {
      characters: references.filter(({ entityType }) => entityType === 'character'),
      locations: references.filter(({ entityType }) => entityType === 'location'),
    };
  }

  async create(
    draft: AdminCharacterLocationRelationDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminCharacterLocationRelationRecord> {
    const url = this.#tableUrl('character_location_relations');
    url.searchParams.set('select', RELATION_SELECT);
    const payload = await this.#requestJson(
      url,
      {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          character_id: draft.characterId,
          location_id: draft.locationId,
          relation_status: draft.relationStatus,
          publication_status: draft.publicationStatus,
        }),
      },
      options.signal,
    );
    return this.#singleRelation(payload);
  }

  async update(
    original: AdminCharacterLocationRelationRecord,
    draft: AdminCharacterLocationRelationDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminCharacterLocationRelationRecord> {
    const url = this.#tableUrl('character_location_relations');
    url.searchParams.set('character_id', `eq.${original.characterId}`);
    url.searchParams.set('location_id', `eq.${original.locationId}`);
    url.searchParams.set('updated_at', `eq.${original.updatedAt}`);
    url.searchParams.set('select', RELATION_SELECT);
    const payload = await this.#requestJson(
      url,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          relation_status: draft.relationStatus,
          publication_status: draft.publicationStatus,
        }),
      },
      options.signal,
    );
    if (Array.isArray(payload) && payload.length === 0) {
      throw new AdminCharacterLocationRelationRepositoryError(
        'stale-write',
        'La relación cambió mientras la editabas. Recarga antes de continuar.',
      );
    }
    return this.#singleRelation(payload);
  }

  #tableUrl(table: string): URL {
    return new URL(`${this.#projectUrl}/rest/v1/${table}`);
  }

  #singleRelation(payload: unknown): AdminCharacterLocationRelationRecord {
    if (!Array.isArray(payload) || payload.length !== 1) {
      throw new AdminCharacterLocationRelationRepositoryError(
        'invalid-response',
        'Supabase no devolvió una única relación.',
      );
    }
    return mapRelation(payload[0]);
  }

  #invalidCollection(): never {
    throw new AdminCharacterLocationRelationRepositoryError(
      'invalid-response',
      'Supabase devolvió una colección administrativa no válida.',
    );
  }

  async #requestJson(url: URL, init: RequestInit, parentSignal: AbortSignal): Promise<unknown> {
    const response = await this.#request(url, init, parentSignal);
    try {
      return await response.json();
    } catch (error) {
      throw new AdminCharacterLocationRelationRepositoryError(
        'invalid-response',
        'Supabase devolvió JSON administrativo no válido.',
        { cause: error },
      );
    }
  }

  async #request(url: URL, init: RequestInit, parentSignal: AbortSignal): Promise<Response> {
    const accessToken = this.#readAccessToken();
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    if (parentSignal.aborted) controller.abort();
    else parentSignal.addEventListener('abort', abort, { once: true });
    const timeout = globalThis.setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.#fetchImplementation(url, {
          ...init,
          headers: {
            Accept: 'application/json',
            apikey: this.#publishableKey,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...init.headers,
          },
          cache: 'no-store',
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted && !parentSignal.aborted) {
          throw new AdminCharacterLocationRelationRepositoryError(
            'request-timeout',
            'La operación sobre la relación superó el tiempo de espera.',
            { cause: error },
          );
        }
        throw new AdminCharacterLocationRelationRepositoryError(
          'backend-unavailable',
          'No se pudo contactar con el servicio administrativo de relaciones.',
          { cause: error },
        );
      }
      if (response.status === 401) {
        throw new AdminCharacterLocationRelationRepositoryError(
          'session-expired',
          'La sesión administrativa ha caducado. Inicia sesión de nuevo.',
          { status: 401 },
        );
      }
      if (response.status === 403) {
        throw new AdminCharacterLocationRelationRepositoryError(
          'unauthorized',
          'La sesión ya no dispone de autorización administrativa.',
          { status: 403 },
        );
      }
      if (!response.ok) {
        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        const code = responseCode(payload);
        if (code === '23505') {
          throw new AdminCharacterLocationRelationRepositoryError(
            'conflict',
            'Ese personaje ya está relacionado con el emplazamiento.',
            { status: response.status },
          );
        }
        if (code === '23503') {
          throw new AdminCharacterLocationRelationRepositoryError(
            'invalid-relation',
            'Uno de los extremos de la relación ya no existe.',
            { status: response.status },
          );
        }
        if (code === '23514' || code === '22P02') {
          throw new AdminCharacterLocationRelationRepositoryError(
            'operation-prohibited',
            'PostgreSQL rechazó una relación incompatible, archivada o con un lifecycle inválido.',
            { status: response.status },
          );
        }
        if (code === '42501') {
          throw new AdminCharacterLocationRelationRepositoryError(
            'unauthorized',
            'PostgreSQL rechazó la operación administrativa.',
            { status: response.status },
          );
        }
        throw new AdminCharacterLocationRelationRepositoryError(
          response.status >= 500 ? 'backend-unavailable' : 'unexpected',
          'El servicio administrativo rechazó la operación.',
          { status: response.status },
        );
      }
      return response;
    } finally {
      globalThis.clearTimeout(timeout);
      parentSignal.removeEventListener('abort', abort);
    }
  }

  #readAccessToken(): string {
    let serialized: string | null;
    try {
      serialized = this.#storage.getItem(AUTH_SESSION_STORAGE_KEY);
    } catch (error) {
      throw new AdminCharacterLocationRelationRepositoryError(
        'session-expired',
        'No se pudo leer la sesión administrativa de esta pestaña.',
        { cause: error },
      );
    }
    if (!serialized) {
      throw new AdminCharacterLocationRelationRepositoryError(
        'session-expired',
        'No hay una sesión administrativa activa.',
      );
    }
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
        throw new Error('invalid administrative session');
      }
      return parsed.accessToken;
    } catch (error) {
      throw new AdminCharacterLocationRelationRepositoryError(
        'session-expired',
        'La sesión administrativa almacenada no es válida.',
        { cause: error },
      );
    }
  }
}
