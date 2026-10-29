import {
  type LocalMapContext,
  type LocalMapContextDraft,
  type LocalMapBinding,
  type LocalMapPlacement,
  type LocalMapEntity,
  type LocalGeography,
  validateLocalGeometry,
} from '../../domain/adminLocalMaps';
import type { MapEntityType } from '../../domain/adminMapEntities';
import type { MapEntityGeometry } from '../../domain/mapGeometry';
import { AUTH_SESSION_STORAGE_KEY, BrowserAuthSessionStorage } from './authSessionStorage';

type JsonRow = Record<string, unknown>;
const CONTEXT_SELECT =
  'id,slug,name,parent_id,width,height,publication_status,image_uri,loading_strategy,source_url,rights_holder,attribution,license_notes,updated_at';
const BINDING_SELECT = 'campaign_id,geographic_name_id,map_context_id';
const PLACEMENT_SELECT =
  'campaign_id,map_context_id,entity_id,geometry,publication_status,updated_at';
const PROJECT_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const LOCAL_PATTERN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/?$/i;
const PUBLISHABLE_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{10,}$/;
const LEGACY_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export class AdminLocalMapError extends Error {
  constructor(
    readonly code:
      | 'session-expired'
      | 'unauthorized'
      | 'backend'
      | 'invalid-response'
      | 'conflict'
      | 'stale'
      | 'constraint'
      | 'validation',
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AdminLocalMapError';
  }
}
function obj(value: unknown): JsonRow {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AdminLocalMapError('invalid-response', 'Respuesta administrativa inválida.');
  return value as JsonRow;
}
function string(row: JsonRow, key: string): string {
  if (typeof row[key] !== 'string')
    throw new AdminLocalMapError('invalid-response', 'Respuesta administrativa incompleta.');
  return row[key] as string;
}
function optional(row: JsonRow, key: string): string | null {
  if (row[key] === null) return null;
  return string(row, key);
}
function status(row: JsonRow): 'draft' | 'published' | 'archived' {
  const value = string(row, 'publication_status');
  if (value !== 'draft' && value !== 'published' && value !== 'archived')
    throw new AdminLocalMapError('invalid-response', 'Estado de publicación desconocido.');
  return value;
}
function number(row: JsonRow, key: string): number {
  if (typeof row[key] !== 'number' || !Number.isFinite(row[key]))
    throw new AdminLocalMapError('invalid-response', 'Dimensiones no válidas.');
  return row[key] as number;
}
export function parseLocalContext(value: unknown): LocalMapContext {
  const row = obj(value);
  const strategy = optional(row, 'loading_strategy');
  if (strategy && strategy !== 'remote' && strategy !== 'bundled')
    throw new AdminLocalMapError('invalid-response', 'Estrategia de imagen no reconocida.');
  return {
    id: string(row, 'id'),
    slug: string(row, 'slug'),
    name: string(row, 'name'),
    parentId: optional(row, 'parent_id'),
    width: number(row, 'width'),
    height: number(row, 'height'),
    publicationStatus: status(row),
    imageUri: optional(row, 'image_uri'),
    loadingStrategy: strategy as LocalMapContext['loadingStrategy'],
    sourceUrl: optional(row, 'source_url'),
    rightsHolder: optional(row, 'rights_holder'),
    attribution: optional(row, 'attribution'),
    licenseNotes: optional(row, 'license_notes'),
    updatedAt: string(row, 'updated_at'),
  };
}
function contextPayload(draft: LocalMapContextDraft): JsonRow {
  const nullIfEmpty = (value: string | null): string | null => value?.trim() || null;
  return {
    name: draft.name.trim(),
    parent_id: draft.parentId,
    width: draft.width,
    height: draft.height,
    publication_status: draft.publicationStatus,
    image_uri: nullIfEmpty(draft.imageUri),
    loading_strategy: draft.loadingStrategy,
    source_url: nullIfEmpty(draft.sourceUrl),
    rights_holder: nullIfEmpty(draft.rightsHolder),
    attribution: nullIfEmpty(draft.attribution),
    license_notes: nullIfEmpty(draft.licenseNotes),
  };
}
export interface GlobalContextDependencies {
  readonly placementCount: number;
  readonly bindingCount: number;
}
export interface LocalMapRepository {
  listContexts(signal: AbortSignal): Promise<LocalMapContext[]>;
  listGlobalContextDependencies(
    signal: AbortSignal,
  ): Promise<ReadonlyMap<string, GlobalContextDependencies>>;
  saveContext(
    draft: LocalMapContextDraft,
    original: LocalMapContext | null,
    signal: AbortSignal,
  ): Promise<LocalMapContext>;
  deleteContext(context: LocalMapContext, signal: AbortSignal): Promise<void>;
  listBindings(campaignId: string, signal: AbortSignal): Promise<LocalMapBinding[]>;
  listGeography(signal: AbortSignal): Promise<LocalGeography[]>;
  saveBinding(binding: LocalMapBinding, signal: AbortSignal): Promise<void>;
  deleteBinding(binding: LocalMapBinding, signal: AbortSignal): Promise<void>;
  listEntities(campaignId: string, signal: AbortSignal): Promise<LocalMapEntity[]>;
  listPlacements(campaignId: string, signal: AbortSignal): Promise<LocalMapPlacement[]>;
  savePlacement(
    placement: Omit<LocalMapPlacement, 'updatedAt'>,
    original: LocalMapPlacement | null,
    context: LocalMapContext,
    entityType: MapEntityType,
    signal: AbortSignal,
  ): Promise<void>;
  deletePlacement(placement: LocalMapPlacement, signal: AbortSignal): Promise<void>;
}
export class SupabaseLocalMapRepository implements LocalMapRepository {
  readonly #url: string;
  readonly #key: string;
  readonly #storage: BrowserAuthSessionStorage;
  readonly #fetch: typeof fetch;
  readonly #timeout: number;
  readonly #now: () => number;
  constructor(options: {
    projectUrl: string;
    publishableKey: string;
    allowLocalProject?: boolean;
    storage?: BrowserAuthSessionStorage;
    fetchImplementation?: typeof fetch;
    timeoutMs?: number;
    now?: () => number;
  }) {
    const url = options.projectUrl.trim();
    const local = options.allowLocalProject === true && LOCAL_PATTERN.test(url);
    if (
      !(PROJECT_PATTERN.test(url) || local) ||
      !(
        PUBLISHABLE_PATTERN.test(options.publishableKey) ||
        (local && LEGACY_PATTERN.test(options.publishableKey))
      )
    ) {
      throw new AdminLocalMapError('backend', 'Configuración de mapas locales no disponible.');
    }
    this.#url = url.replace(/\/$/, '');
    this.#key = options.publishableKey;
    this.#storage = options.storage ?? new BrowserAuthSessionStorage();
    this.#storage.assertAvailable();
    this.#fetch = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
    this.#timeout = options.timeoutMs ?? 8000;
    this.#now = options.now ?? Date.now;
  }
  #token(): string {
    try {
      const serialized = this.#storage.getItem(AUTH_SESSION_STORAGE_KEY);
      const row = obj(serialized ? JSON.parse(serialized) : null);
      if (
        row.version !== 1 ||
        typeof row.accessToken !== 'string' ||
        !row.accessToken ||
        typeof row.expiresAt !== 'number' ||
        row.expiresAt * 1000 <= this.#now()
      )
        throw new Error('expired');
      return row.accessToken;
    } catch {
      throw new AdminLocalMapError(
        'session-expired',
        'La sesión administrativa ha caducado. Inicia sesión de nuevo.',
        401,
      );
    }
  }
  #urlFor(table: string, params: Record<string, string> = {}): URL {
    const url = new URL(this.#url + '/rest/v1/' + table);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url;
  }
  async #request(
    url: URL,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    signal: AbortSignal,
    data?: JsonRow,
  ): Promise<unknown> {
    const token = this.#token();
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', abort, { once: true });
    const timer = globalThis.setTimeout(() => controller.abort(), this.#timeout);
    try {
      let response: Response;
      try {
        response = await this.#fetch(url, {
          method,
          signal: controller.signal,
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            apikey: this.#key,
            Authorization: 'Bearer ' + token,
            Prefer: method === 'GET' ? 'count=exact' : 'return=representation',
            ...(method === 'GET' ? { Range: '0-999', 'Range-Unit': 'items' } : {}),
          },
          ...(data ? { body: JSON.stringify(data) } : {}),
        });
      } catch (e) {
        if (signal.aborted) throw e;
        throw new AdminLocalMapError(
          'backend',
          controller.signal.aborted
            ? 'La petición ha agotado el tiempo de espera.'
            : 'Fallo de red. Vuelve a intentarlo.',
        );
      }
      if (response.status === 401)
        throw new AdminLocalMapError('session-expired', 'La sesión ha caducado.', 401);
      if (response.status === 403)
        throw new AdminLocalMapError(
          'unauthorized',
          'No tienes permiso para administrar mapas.',
          403,
        );
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AdminLocalMapError('invalid-response', 'Respuesta del servidor no válida.');
      }
      if (!response.ok) {
        const error = obj(payload);
        const code = String(error.code ?? '');
        const detail = String(error.message ?? '');
        if (code === '23505')
          throw new AdminLocalMapError(
            'conflict',
            'Ya existe un registro con ese ID, slug o combinación.',
            response.status,
          );
        if (code === '42501')
          throw new AdminLocalMapError(
            'unauthorized',
            'Permiso de escritura denegado por PostgreSQL.',
            403,
          );
        const hints: Readonly<Record<string, string>> = {
          'map dimensions cannot change while placements exist':
            'No se pueden cambiar dimensiones mientras existan placements.',
          'map context hierarchy cycle': 'La jerarquía crea un ciclo.',
          'published context requires a published parent': 'Publica primero el contexto padre.',
          'published descendants require a published parent':
            'No puedes archivar un padre con hijos publicados.',
          'organization cannot have a placement': 'Las organizaciones no tienen placements.',
          'entity not found in placement campaign': 'Entidad no válida para la campaña activa.',
          'point geometry is outside map bounds':
            'El punto está fuera de las dimensiones del contexto.',
          'polygon geometry is outside map bounds':
            'Hay vértices fuera de las dimensiones del contexto.',
          'map context identity is immutable': 'El ID y el slug no se pueden modificar.',
        };
        if (code === '23514' || code === '23503' || code === '22P02') {
          throw new AdminLocalMapError(
            'constraint',
            hints[detail] ??
              'PostgreSQL rechazó los datos o sus dependencias. Revisa el contexto, geometría y relaciones.',
            response.status,
          );
        }
        throw new AdminLocalMapError(
          'backend',
          response.status >= 500
            ? 'Servicio temporalmente no disponible.'
            : 'La operación ha sido rechazada.',
          response.status,
        );
      }
      if (!Array.isArray(payload))
        throw new AdminLocalMapError('invalid-response', 'Se esperaba una colección de registros.');
      if (method === 'GET') {
        const range = response.headers.get('content-range');
        const match = range?.match(/^(?:\*|\d+-\d+)\/(\d+)$/);
        if (!match || Number(match[1]) !== payload.length)
          throw new AdminLocalMapError(
            'invalid-response',
            'Listado incompleto. Acota la búsqueda o revisa el backend.',
          );
      }
      return payload;
    } finally {
      globalThis.clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }
  async #rows(url: URL, signal: AbortSignal): Promise<JsonRow[]> {
    const payload = await this.#request(url, 'GET', signal);
    return (payload as unknown[]).map(obj);
  }
  async #write(
    url: URL,
    method: 'POST' | 'PATCH',
    body: JsonRow,
    signal: AbortSignal,
  ): Promise<JsonRow> {
    const rows = (await this.#request(url, method, signal, body)) as unknown[];
    if (rows.length === 0)
      throw new AdminLocalMapError('stale', 'El registro ya cambió. Recarga antes de guardar.');
    if (rows.length !== 1)
      throw new AdminLocalMapError('invalid-response', 'No se confirmó una única escritura.');
    return obj(rows[0]);
  }
  async #delete(url: URL, signal: AbortSignal): Promise<void> {
    const rows = (await this.#request(url, 'DELETE', signal)) as unknown[];
    if (rows.length !== 1)
      throw new AdminLocalMapError('stale', 'El registro ha cambiado o ya no existe.');
  }
  async listContexts(signal: AbortSignal): Promise<LocalMapContext[]> {
    const rows = await this.#rows(
      this.#urlFor('map_contexts', { select: CONTEXT_SELECT, order: 'name.asc,id.asc' }),
      signal,
    );
    return rows.map(parseLocalContext);
  }
  async listGlobalContextDependencies(
    signal: AbortSignal,
  ): Promise<ReadonlyMap<string, GlobalContextDependencies>> {
    // Embedding by foreign keys counts ALL campaigns without reading private
    // campaign-scoped rows through the MAP-070 request interceptor.
    const rows = await this.#rows(
      this.#urlFor('map_contexts', {
        select:
          'id,placements:entity_map_placements(count),bindings:campaign_geographic_map_context_links(count)',
        order: 'id.asc',
      }),
      signal,
    );
    const count = (row: JsonRow, key: string): number => {
      const embedded = row[key];
      if (!Array.isArray(embedded) || embedded.length !== 1) {
        throw new AdminLocalMapError('invalid-response', 'No se pudieron verificar las dependencias globales.');
      }
      const value = obj(embedded[0]).count;
      if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new AdminLocalMapError('invalid-response', 'Conteo global de dependencias inválido.');
      }
      return value as number;
    };
    const dependencies = new Map<string, GlobalContextDependencies>();
    for (const row of rows) {
      const id = string(row, 'id');
      if (dependencies.has(id)) {
        throw new AdminLocalMapError('invalid-response', 'Contexto global duplicado en respuesta.');
      }
      dependencies.set(id, {
        placementCount: count(row, 'placements'),
        bindingCount: count(row, 'bindings'),
      });
    }
    return dependencies;
  }
  async saveContext(
    draft: LocalMapContextDraft,
    original: LocalMapContext | null,
    signal: AbortSignal,
  ): Promise<LocalMapContext> {
    const body = contextPayload(draft);
    const url = this.#urlFor('map_contexts', { select: CONTEXT_SELECT });
    if (original) {
      url.searchParams.set('id', 'eq.' + original.id);
      url.searchParams.set('updated_at', 'eq.' + original.updatedAt);
      return parseLocalContext(await this.#write(url, 'PATCH', body, signal));
    }
    return parseLocalContext(
      await this.#write(url, 'POST', { id: draft.id, slug: draft.slug, ...body }, signal),
    );
  }
  async deleteContext(context: LocalMapContext, signal: AbortSignal): Promise<void> {
    await this.#delete(
      this.#urlFor('map_contexts', {
        id: 'eq.' + context.id,
        updated_at: 'eq.' + context.updatedAt,
      }),
      signal,
    );
  }
  async listBindings(campaignId: string, signal: AbortSignal): Promise<LocalMapBinding[]> {
    const rows = await this.#rows(
      this.#urlFor('campaign_geographic_map_context_links', {
        select: BINDING_SELECT,
        campaign_id: 'eq.' + campaignId,
        order: 'geographic_name_id.asc',
      }),
      signal,
    );
    return rows
      .map((row) => ({
        campaignId: string(row, 'campaign_id'),
        geographicNameId: string(row, 'geographic_name_id'),
        mapContextId: string(row, 'map_context_id'),
      }))
      .filter((b) => b.campaignId === campaignId);
  }
  async listGeography(signal: AbortSignal): Promise<LocalGeography[]> {
    const rows = await this.#rows(
      this.#urlFor('geographic_names', { select: 'id,name', order: 'name.asc,id.asc' }),
      signal,
    );
    return rows.map((row) => ({ id: string(row, 'id'), name: string(row, 'name') }));
  }
  async saveBinding(binding: LocalMapBinding, signal: AbortSignal): Promise<void> {
    const url = this.#urlFor('campaign_geographic_map_context_links', { select: BINDING_SELECT });
    await this.#write(
      url,
      'POST',
      {
        campaign_id: binding.campaignId,
        geographic_name_id: binding.geographicNameId,
        map_context_id: binding.mapContextId,
      },
      signal,
    );
  }
  async deleteBinding(binding: LocalMapBinding, signal: AbortSignal): Promise<void> {
    await this.#delete(
      this.#urlFor('campaign_geographic_map_context_links', {
        campaign_id: 'eq.' + binding.campaignId,
        geographic_name_id: 'eq.' + binding.geographicNameId,
        map_context_id: 'eq.' + binding.mapContextId,
      }),
      signal,
    );
  }
  async listEntities(campaignId: string, signal: AbortSignal): Promise<LocalMapEntity[]> {
    const rows = await this.#rows(
      this.#urlFor('map_entities', {
        select: 'id,name,entity_type',
        campaign_id: 'eq.' + campaignId,
        entity_type: 'neq.organization',
        order: 'name.asc,id.asc',
      }),
      signal,
    );
    return rows
      .map((row) => ({
        id: string(row, 'id'),
        name: string(row, 'name'),
        entityType: string(row, 'entity_type') as MapEntityType,
      }))
      .filter((entity) =>
        ['character', 'location', 'mission', 'hazard'].includes(entity.entityType),
      );
  }
  async listPlacements(campaignId: string, signal: AbortSignal): Promise<LocalMapPlacement[]> {
    const rows = await this.#rows(
      this.#urlFor('entity_map_placements', {
        select: PLACEMENT_SELECT,
        campaign_id: 'eq.' + campaignId,
        order: 'map_context_id.asc,entity_id.asc',
      }),
      signal,
    );
    return rows
      .map((row) => ({
        campaignId: string(row, 'campaign_id'),
        mapContextId: string(row, 'map_context_id'),
        entityId: string(row, 'entity_id'),
        geometry: obj(row.geometry) as unknown as MapEntityGeometry,
        publicationStatus: status(row),
        updatedAt: string(row, 'updated_at'),
      }))
      .filter((p) => p.campaignId === campaignId);
  }
  async savePlacement(
    placement: Omit<LocalMapPlacement, 'updatedAt'>,
    original: LocalMapPlacement | null,
    context: LocalMapContext,
    entityType: MapEntityType,
    signal: AbortSignal,
  ): Promise<void> {
    const geometry = validateLocalGeometry(placement.geometry, entityType, context);
    const body = { geometry, publication_status: placement.publicationStatus } as JsonRow;
    const url = this.#urlFor('entity_map_placements', { select: PLACEMENT_SELECT });
    if (original) {
      if (
        original.campaignId !== placement.campaignId ||
        original.entityId !== placement.entityId ||
        original.mapContextId !== placement.mapContextId
      ) {
        throw new AdminLocalMapError(
          'validation',
          'La identidad del placement no se puede cambiar.',
        );
      }
      url.searchParams.set('campaign_id', 'eq.' + original.campaignId);
      url.searchParams.set('map_context_id', 'eq.' + original.mapContextId);
      url.searchParams.set('entity_id', 'eq.' + original.entityId);
      url.searchParams.set('updated_at', 'eq.' + original.updatedAt);
      await this.#write(url, 'PATCH', body, signal);
    } else {
      await this.#write(
        url,
        'POST',
        {
          ...body,
          campaign_id: placement.campaignId,
          map_context_id: placement.mapContextId,
          entity_id: placement.entityId,
        },
        signal,
      );
    }
  }
  async deletePlacement(placement: LocalMapPlacement, signal: AbortSignal): Promise<void> {
    await this.#delete(
      this.#urlFor('entity_map_placements', {
        campaign_id: 'eq.' + placement.campaignId,
        map_context_id: 'eq.' + placement.mapContextId,
        entity_id: 'eq.' + placement.entityId,
        updated_at: 'eq.' + placement.updatedAt,
      }),
      signal,
    );
  }
}
