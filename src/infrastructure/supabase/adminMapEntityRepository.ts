import {
  AdminMapEntityRepositoryError,
  type AdminMapEntityRepository,
} from '../../data-access/adminMapEntities';
import {
  canPhysicallyDeleteMapEntity,
  type AdminCategoryReference,
  type AdminEntityDisposition,
  type AdminEntityTagLink,
  type AdminMapEntityDeleteBlockers,
  type AdminMapEntityDetail,
  type AdminMapEntityDraft,
  type AdminMapEntityRecord,
  type AdminMapEntityReferences,
  type AdminPlayerReference,
  type AdminTagReference,
  type MapEntityAudience,
  type MapEntityPublicationStatus,
  type MapEntityType,
  type MapVisibility,
  type PlayerDisposition,
} from '../../domain/adminMapEntities';
import { AUTH_SESSION_STORAGE_KEY, BrowserAuthSessionStorage } from './authSessionStorage';

const HOSTED_PROJECT_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const LOCAL_PROJECT_URL_PATTERN = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/i;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{10,}$/;
const LEGACY_ANON_KEY_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const DEFAULT_TIMEOUT_MS = 8_000;
const PAGE_SIZE = 1000;

interface AdminMapEntityRepositoryOptions {
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
    throw new AdminMapEntityRepositoryError(
      'invalid-response',
      'Supabase devolvió datos de entidad no válidos.',
    );
  }
  return value;
}

function nullableString(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new AdminMapEntityRepositoryError(
      'invalid-response',
      'Supabase devolvió datos de entidad no válidos.',
    );
  }
  return value;
}

function numberValue(row: Record<string, unknown>, field: string): number {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AdminMapEntityRepositoryError(
      'invalid-response',
      'Supabase devolvió coordenadas o contadores no válidos.',
    );
  }
  return value;
}

function publicationStatus(value: unknown): MapEntityPublicationStatus {
  if (value === 'draft' || value === 'published' || value === 'archived') return value;
  throw new AdminMapEntityRepositoryError(
    'invalid-response',
    'Supabase devolvió un estado editorial no válido.',
  );
}

function entityType(value: unknown): MapEntityType {
  if (value === 'character' || value === 'location') return value;
  throw new AdminMapEntityRepositoryError(
    'invalid-response',
    'Supabase devolvió un tipo de entidad no válido.',
  );
}

function visibility(value: unknown): MapVisibility {
  if (value === 'pin' || value === 'search_only') return value;
  throw new AdminMapEntityRepositoryError(
    'invalid-response',
    'Supabase devolvió una visibilidad cartográfica no válida.',
  );
}

function audience(value: unknown): MapEntityAudience {
  if (value === 'public' || value === 'master') return value;
  throw new AdminMapEntityRepositoryError(
    'invalid-response',
    'Supabase devolvió una audiencia de entidad no válida.',
  );
}

function disposition(value: unknown): PlayerDisposition {
  if (value === 'ally' || value === 'enemy' || value === 'neutral') return value;
  throw new AdminMapEntityRepositoryError(
    'invalid-response',
    'Supabase devolvió una disposición no válida.',
  );
}

function mapRecord(row: Record<string, unknown>): AdminMapEntityRecord {
  return {
    id: requiredString(row, 'id'),
    slug: requiredString(row, 'slug'),
    entityType: entityType(row.entity_type),
    visibility: visibility(row.visibility),
    audience: audience(row.audience),
    name: requiredString(row, 'name'),
    summary: typeof row.summary === 'string' ? row.summary : '',
    description: typeof row.description === 'string' ? row.description : '',
    x: numberValue(row, 'x'),
    y: numberValue(row, 'y'),
    categoryId: nullableString(row, 'category_id') ?? '',
    publicationStatus: publicationStatus(row.publication_status),
    publishedAt: nullableString(row, 'published_at'),
    archivedAt: nullableString(row, 'archived_at'),
    updatedAt: requiredString(row, 'updated_at'),
  };
}

function mapTagLink(value: unknown): AdminEntityTagLink {
  if (!isRecord(value)) {
    throw new AdminMapEntityRepositoryError(
      'invalid-response',
      'Supabase devolvió tags no válidos.',
    );
  }
  return {
    id: requiredString(value, 'id'),
    tagId: requiredString(value, 'tag_id'),
    publicationStatus: publicationStatus(value.publication_status),
    publishedAt: nullableString(value, 'published_at'),
    updatedAt: requiredString(value, 'updated_at'),
  };
}

function mapDisposition(value: unknown): AdminEntityDisposition {
  if (!isRecord(value)) {
    throw new AdminMapEntityRepositoryError(
      'invalid-response',
      'Supabase devolvió disposiciones no válidas.',
    );
  }
  return {
    playerId: requiredString(value, 'player_id'),
    displayName: requiredString(value, 'display_name'),
    disposition: disposition(value.disposition),
    updatedAt: requiredString(value, 'updated_at'),
  };
}

function mapBlockers(value: unknown): AdminMapEntityDeleteBlockers {
  if (!isRecord(value)) {
    throw new AdminMapEntityRepositoryError(
      'invalid-response',
      'Supabase devolvió relaciones de borrado no válidas.',
    );
  }
  return {
    aliases: numberValue(value, 'aliases'),
    tags: numberValue(value, 'tags'),
    geographicNames: numberValue(value, 'geographic_names'),
    notes: numberValue(value, 'notes'),
    locationEvents: numberValue(value, 'location_events'),
    requests: numberValue(value, 'requests'),
  };
}

function mapDetail(payload: unknown): AdminMapEntityDetail {
  if (!isRecord(payload) || !isRecord(payload.record)) {
    throw new AdminMapEntityRepositoryError(
      'invalid-response',
      'Supabase no devolvió el editor de entidad esperado.',
    );
  }
  if (!Array.isArray(payload.tag_links) || !Array.isArray(payload.dispositions)) {
    throw new AdminMapEntityRepositoryError(
      'invalid-response',
      'Supabase devolvió relaciones de entidad no válidas.',
    );
  }
  return {
    record: mapRecord(payload.record),
    tagLinks: payload.tag_links.map(mapTagLink),
    dispositions: payload.dispositions.map(mapDisposition),
    relationsRevision: requiredString(payload, 'relations_revision'),
    deleteBlockers: mapBlockers(payload.delete_blockers),
  };
}

function parseErrorCode(value: unknown): string | null {
  return isRecord(value) && typeof value.code === 'string' ? value.code : null;
}

export class SupabaseAdminMapEntityRepository implements AdminMapEntityRepository {
  readonly #projectUrl: string;
  readonly #publishableKey: string;
  readonly #storage: BrowserAuthSessionStorage;
  readonly #fetchImplementation: typeof fetch;
  readonly #timeoutMs: number;
  readonly #now: () => number;

  constructor(options: AdminMapEntityRepositoryOptions) {
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
      throw new AdminMapEntityRepositoryError(
        'backend-unavailable',
        'La configuración administrativa de entidades no está disponible.',
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

  async list(options: { readonly signal: AbortSignal }): Promise<readonly AdminMapEntityRecord[]> {
    const rows = await this.#listRows(
      'map_entities',
      'id,slug,entity_type,visibility,audience,name,summary,description,x,y,category_id,publication_status,published_at,archived_at,updated_at',
      'name.asc,id.asc',
      options.signal,
    );
    return rows.map(mapRecord);
  }

  async loadReferences(options: {
    readonly signal: AbortSignal;
  }): Promise<AdminMapEntityReferences> {
    const [categoryRows, tagRows, playerRows] = await Promise.all([
      this.#listRows('categories', 'id,name,publication_status', 'name.asc,id.asc', options.signal),
      this.#listRows('tags', 'id,name,publication_status', 'name.asc,id.asc', options.signal),
      this.#listRows(
        'players',
        'id,display_name,publication_status',
        'display_name.asc,id.asc',
        options.signal,
      ),
    ]);

    const categories: AdminCategoryReference[] = categoryRows.map((row) => ({
      id: requiredString(row, 'id'),
      name: requiredString(row, 'name'),
      publicationStatus: publicationStatus(row.publication_status),
    }));
    const tags: AdminTagReference[] = tagRows.map((row) => ({
      id: requiredString(row, 'id'),
      name: requiredString(row, 'name'),
      publicationStatus: publicationStatus(row.publication_status),
    }));
    const players: AdminPlayerReference[] = playerRows.map((row) => ({
      id: requiredString(row, 'id'),
      displayName: requiredString(row, 'display_name'),
      publicationStatus: publicationStatus(row.publication_status),
    }));

    return { categories, tags, players };
  }

  async load(
    entityId: string,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminMapEntityDetail> {
    const response = await this.#request(
      new URL(`${this.#projectUrl}/rest/v1/rpc/admin_get_map_entity_editor_v2`),
      { method: 'POST', body: JSON.stringify({ p_entity_id: entityId }) },
      options.signal,
    );
    const payload = await this.#readJson(response);
    if (payload === null) {
      throw new AdminMapEntityRepositoryError(
        'stale-write',
        'La entidad ya no está disponible. Recarga la lista.',
      );
    }
    return mapDetail(payload);
  }

  async save(
    original: AdminMapEntityDetail | null,
    draft: AdminMapEntityDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminMapEntityDetail> {
    const response = await this.#request(
      new URL(`${this.#projectUrl}/rest/v1/rpc/admin_save_map_entity_v2`),
      {
        method: 'POST',
        body: JSON.stringify({
          p_id: draft.id,
          p_expected_updated_at: original?.record.updatedAt ?? null,
          p_expected_relations_revision: original?.relationsRevision ?? null,
          p_slug: draft.slug,
          p_entity_type: draft.entityType,
          p_visibility: draft.visibility,
          p_audience: draft.audience,
          p_name: draft.name.trim(),
          p_summary: draft.summary.trim(),
          p_description: draft.description.trim(),
          p_x: draft.x,
          p_y: draft.y,
          p_category_id: draft.categoryId,
          p_publication_status: draft.publicationStatus,
          p_tag_ids: [...draft.tagIds],
          p_dispositions: draft.dispositions,
        }),
      },
      options.signal,
    );
    return mapDetail(await this.#readJson(response));
  }

  async delete(
    detail: AdminMapEntityDetail,
    options: { readonly signal: AbortSignal },
  ): Promise<void> {
    if (!canPhysicallyDeleteMapEntity(detail)) {
      throw new AdminMapEntityRepositoryError(
        'operation-prohibited',
        'Solo se puede eliminar físicamente un borrador nunca publicado y sin relaciones.',
      );
    }
    const url = new URL(`${this.#projectUrl}/rest/v1/map_entities`);
    url.searchParams.set('id', `eq.${detail.record.id}`);
    url.searchParams.set('updated_at', `eq.${detail.record.updatedAt}`);
    url.searchParams.set('select', 'id');
    const response = await this.#request(
      url,
      { method: 'DELETE', headers: { Prefer: 'return=representation' } },
      options.signal,
    );
    const payload = await this.#readJson(response);
    if (!Array.isArray(payload) || payload.length === 0) {
      throw new AdminMapEntityRepositoryError(
        'stale-write',
        'La entidad cambió antes de poder eliminarla. Recarga el editor.',
      );
    }
  }

  #tableUrl(table: string): URL {
    return new URL(`${this.#projectUrl}/rest/v1/${table}`);
  }

  async #listRows(
    table: string,
    select: string,
    order: string,
    signal: AbortSignal,
  ): Promise<readonly Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    let offset = 0;
    let expectedTotal: number | null = null;

    do {
      const url = this.#tableUrl(table);
      url.searchParams.set('select', select);
      url.searchParams.set('order', order);
      const response = await this.#request(
        url,
        {
          method: 'GET',
          headers: {
            Prefer: 'count=exact',
            Range: `${offset}-${offset + PAGE_SIZE - 1}`,
            'Range-Unit': 'items',
          },
        },
        signal,
      );
      const payload = await this.#readJson(response);
      if (!Array.isArray(payload) || payload.some((row) => !isRecord(row))) {
        throw new AdminMapEntityRepositoryError(
          'invalid-response',
          'Supabase devolvió una colección administrativa no válida.',
        );
      }
      const contentRange = response.headers.get('content-range');
      const match = contentRange?.match(/^(?:\*|(\d+)-(\d+))\/(\d+)$/);
      if (!match) {
        throw new AdminMapEntityRepositoryError(
          'invalid-response',
          'Supabase no confirmó el tamaño de la colección administrativa.',
        );
      }
      const total = Number(match[3]);
      if (!Number.isSafeInteger(total)) {
        throw new AdminMapEntityRepositoryError(
          'invalid-response',
          'Supabase devolvió un tamaño de colección no válido.',
        );
      }
      if (expectedTotal === null) expectedTotal = total;
      else if (expectedTotal !== total) {
        throw new AdminMapEntityRepositoryError(
          'stale-write',
          'El catálogo cambió durante la lectura. Vuelve a cargarlo.',
        );
      }
      if (total === 0) return [];
      const page = payload as Record<string, unknown>[];
      if (Number(match[1]) !== offset || Number(match[2]) !== offset + page.length - 1) {
        throw new AdminMapEntityRepositoryError(
          'invalid-response',
          'Supabase devolvió una página administrativa incompleta.',
        );
      }
      rows.push(...page);
      offset += page.length;
    } while (expectedTotal === null || offset < expectedTotal);

    return rows;
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
          throw new AdminMapEntityRepositoryError(
            'request-timeout',
            'La operación sobre la entidad superó el tiempo de espera.',
            { cause: error },
          );
        }
        throw new AdminMapEntityRepositoryError(
          'backend-unavailable',
          'No se pudo contactar con el servicio administrativo de entidades.',
          { cause: error },
        );
      }

      if (response.status === 401) {
        throw new AdminMapEntityRepositoryError(
          'session-expired',
          'La sesión administrativa ha caducado. Inicia sesión de nuevo.',
          { status: 401 },
        );
      }
      if (response.status === 403) {
        throw new AdminMapEntityRepositoryError(
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
        const code = parseErrorCode(payload);
        if (code === '40001') {
          throw new AdminMapEntityRepositoryError(
            'stale-write',
            'La entidad o sus relaciones cambiaron mientras editabas. Recarga antes de continuar.',
            { status: response.status },
          );
        }
        if (code === '23505') {
          throw new AdminMapEntityRepositoryError(
            'conflict',
            'El ID, slug o nombre entra en conflicto con otro registro o una reserva existente.',
            { status: response.status },
          );
        }
        if (code === '23503') {
          const saving = url.pathname.endsWith('/rpc/admin_save_map_entity_v2');
          throw new AdminMapEntityRepositoryError(
            saving ? 'invalid-relation' : 'referenced',
            saving
              ? 'Una categoría, etiqueta o relación cambió y ya no es válida. Recarga el editor.'
              : 'La entidad conserva relaciones y no puede eliminarse físicamente.',
            { status: response.status },
          );
        }
        if (code === '23514' || code === '22P02') {
          throw new AdminMapEntityRepositoryError(
            'operation-prohibited',
            'PostgreSQL rechazó el cambio para proteger el modelo editorial y sus relaciones.',
            { status: response.status },
          );
        }
        if (code === '42501') {
          throw new AdminMapEntityRepositoryError(
            'unauthorized',
            'PostgreSQL rechazó la operación administrativa.',
            { status: response.status },
          );
        }
        throw new AdminMapEntityRepositoryError(
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
      throw new AdminMapEntityRepositoryError(
        'session-expired',
        'No se pudo leer la sesión administrativa de esta pestaña.',
        { cause: error },
      );
    }
    if (!serialized) {
      throw new AdminMapEntityRepositoryError(
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
      throw new AdminMapEntityRepositoryError(
        'session-expired',
        'La sesión administrativa almacenada no es válida.',
        { cause: error },
      );
    }
  }

  async #readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new AdminMapEntityRepositoryError(
        'invalid-response',
        'Supabase devolvió JSON administrativo no válido.',
        { cause: error },
      );
    }
  }
}
