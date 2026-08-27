import {
  MasterCatalogRepositoryError,
  type AuthorizedMasterCatalog,
  type MasterCatalogAlias,
  type MasterCatalogCategory,
  type MasterCatalogDisposition,
  type MasterCatalogEntity,
  type MasterCatalogEntityTag,
  type MasterCatalogPlayer,
  type MasterCatalogRelation,
  type MasterCatalogRelationEntity,
  type MasterCatalogRepository,
} from '../../data-access/masterCatalog';
import { AUTH_SESSION_STORAGE_KEY, BrowserAuthSessionStorage } from './authSessionStorage';

const HOSTED_PROJECT_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const LOCAL_PROJECT_URL_PATTERN = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/i;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{10,}$/;
const LEGACY_ANON_KEY_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const CAMPAIGN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_TIMEOUT_MS = 8_000;

interface MasterCatalogRepositoryOptions {
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

function stringField(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== 'string' || value.length === 0) throwInvalid();
  return value;
}

function numberField(row: Record<string, unknown>, field: string): number {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) throwInvalid();
  return value;
}

function throwInvalid(): never {
  throw new MasterCatalogRepositoryError(
    'invalid-response',
    'Supabase devolvió un catálogo Máster no válido.',
  );
}

function arrayField(
  payload: Record<string, unknown>,
  field: string,
): readonly Record<string, unknown>[] {
  const value = payload[field];
  if (!Array.isArray(value) || value.some((entry) => !isRecord(entry))) throwInvalid();
  return value as readonly Record<string, unknown>[];
}

function mapEntity(row: Record<string, unknown>): MasterCatalogEntity {
  const entityType = row.entity_type;
  const visibility = row.visibility;
  if (entityType !== 'character' && entityType !== 'location') throwInvalid();
  if (visibility !== 'pin' && visibility !== 'search_only') throwInvalid();
  if (row.audience !== 'master') throwInvalid();
  return {
    id: stringField(row, 'id'),
    slug: stringField(row, 'slug'),
    entityType,
    visibility,
    audience: 'master',
    name: stringField(row, 'name'),
    summary: typeof row.summary === 'string' ? row.summary : '',
    description: typeof row.description === 'string' ? row.description : '',
    portraitPath: row.portrait_path == null ? null : stringField(row, 'portrait_path'),
    x: numberField(row, 'x'),
    y: numberField(row, 'y'),
    categoryId: stringField(row, 'category_id'),
    updatedAt: stringField(row, 'updated_at'),
  };
}

function mapCategory(row: Record<string, unknown>): MasterCatalogCategory {
  return { id: stringField(row, 'id'), name: stringField(row, 'name') };
}

function mapAlias(row: Record<string, unknown>): MasterCatalogAlias {
  return {
    id: stringField(row, 'id'),
    entityId: stringField(row, 'entity_id'),
    value: stringField(row, 'value'),
  };
}

function mapTag(row: Record<string, unknown>) {
  return { id: stringField(row, 'id'), name: stringField(row, 'name') };
}

function mapEntityTag(row: Record<string, unknown>): MasterCatalogEntityTag {
  return { entityId: stringField(row, 'entity_id'), tagId: stringField(row, 'tag_id') };
}

function mapPlayer(row: Record<string, unknown>): MasterCatalogPlayer {
  return { id: stringField(row, 'id'), displayName: stringField(row, 'display_name') };
}

function mapDisposition(row: Record<string, unknown>): MasterCatalogDisposition {
  const disposition = row.disposition;
  if (disposition !== 'ally' && disposition !== 'enemy' && disposition !== 'neutral') {
    throwInvalid();
  }
  return {
    entityId: stringField(row, 'entity_id'),
    playerId: stringField(row, 'player_id'),
    disposition,
  };
}

function mapRelation(row: Record<string, unknown>): MasterCatalogRelation {
  const relationStatus = row.relation_status;
  if (
    relationStatus !== 'present' &&
    relationStatus !== 'associated' &&
    relationStatus !== 'last-seen'
  ) {
    throwInvalid();
  }
  return {
    characterId: stringField(row, 'character_id'),
    locationId: stringField(row, 'location_id'),
    relationStatus,
  };
}

function mapRelationEntity(row: Record<string, unknown>): MasterCatalogRelationEntity {
  const entityType = row.entity_type;
  const audience = row.audience;
  if (entityType !== 'character' && entityType !== 'location') throwInvalid();
  if (audience !== 'public' && audience !== 'master') throwInvalid();
  return {
    id: stringField(row, 'id'),
    name: stringField(row, 'name'),
    entityType,
    audience,
  };
}

function decodeCatalog(payload: unknown): AuthorizedMasterCatalog {
  if (!isRecord(payload)) throwInvalid();
  return {
    entities: arrayField(payload, 'entities').map(mapEntity),
    categories: arrayField(payload, 'categories').map(mapCategory),
    aliases: arrayField(payload, 'aliases').map(mapAlias),
    tags: arrayField(payload, 'tags').map(mapTag),
    entityTags: arrayField(payload, 'entity_tags').map(mapEntityTag),
    players: arrayField(payload, 'players').map(mapPlayer),
    dispositions: arrayField(payload, 'dispositions').map(mapDisposition),
    relations: arrayField(payload, 'relations').map(mapRelation),
    relationEntities: arrayField(payload, 'relation_entities').map(mapRelationEntity),
  };
}

export class SupabaseMasterCatalogRepository implements MasterCatalogRepository {
  readonly #projectUrl: string;
  readonly #publishableKey: string;
  readonly #storage: BrowserAuthSessionStorage;
  readonly #fetchImplementation: typeof fetch;
  readonly #timeoutMs: number;
  readonly #now: () => number;

  constructor(options: MasterCatalogRepositoryOptions) {
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
      throw new MasterCatalogRepositoryError(
        'backend-unavailable',
        'El catálogo Máster no puede inicializarse con la configuración actual.',
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

  async load(options: {
    readonly signal: AbortSignal;
    readonly campaignId: string;
  }): Promise<AuthorizedMasterCatalog> {
    if (!CAMPAIGN_ID_PATTERN.test(options.campaignId)) {
      throw new MasterCatalogRepositoryError(
        'unexpected',
        'La campaña seleccionada no tiene una identidad válida para Modo Máster.',
      );
    }

    const accessToken = this.#readAccessToken();
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', abort, { once: true });
    const timeout = globalThis.setTimeout(() => controller.abort(), this.#timeoutMs);

    try {
      let response: Response;
      try {
        response = await this.#fetchImplementation(
          new URL(`${this.#projectUrl}/rest/v1/rpc/admin_get_master_catalog_v3`),
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              apikey: this.#publishableKey,
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ p_campaign_id: options.campaignId }),
            cache: 'no-store',
            signal: controller.signal,
          },
        );
      } catch (error) {
        if (controller.signal.aborted && !options.signal.aborted) {
          throw new MasterCatalogRepositoryError(
            'request-timeout',
            'La carga de Modo Máster superó el tiempo de espera.',
            { cause: error },
          );
        }
        throw new MasterCatalogRepositoryError(
          'backend-unavailable',
          'No se pudo contactar con el catálogo administrativo.',
          { cause: error },
        );
      }

      if (response.status === 401) {
        throw new MasterCatalogRepositoryError(
          'session-expired',
          'La sesión administrativa ha caducado.',
          { status: 401 },
        );
      }
      if (response.status === 403) {
        throw new MasterCatalogRepositoryError(
          'unauthorized',
          'La sesión ya no dispone de autorización administrativa.',
          { status: 403 },
        );
      }
      if (!response.ok) {
        throw new MasterCatalogRepositoryError(
          response.status >= 500 ? 'backend-unavailable' : 'unexpected',
          'Supabase rechazó la carga del catálogo Máster.',
          { status: response.status },
        );
      }

      try {
        return decodeCatalog(await response.json());
      } catch (error) {
        if (error instanceof MasterCatalogRepositoryError) throw error;
        throw new MasterCatalogRepositoryError(
          'invalid-response',
          'Supabase devolvió JSON Máster no válido.',
          { cause: error },
        );
      }
    } finally {
      globalThis.clearTimeout(timeout);
      options.signal.removeEventListener('abort', abort);
    }
  }

  #readAccessToken(): string {
    let serialized: string | null;
    try {
      serialized = this.#storage.getItem(AUTH_SESSION_STORAGE_KEY);
    } catch (error) {
      throw new MasterCatalogRepositoryError(
        'session-expired',
        'No se pudo leer la sesión administrativa.',
        { cause: error },
      );
    }
    if (!serialized) {
      throw new MasterCatalogRepositoryError('session-expired', 'No hay una sesión admin activa.');
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
        throw new Error('invalid session');
      }
      return parsed.accessToken;
    } catch (error) {
      throw new MasterCatalogRepositoryError(
        'session-expired',
        'La sesión administrativa almacenada no es válida.',
        { cause: error },
      );
    }
  }
}
