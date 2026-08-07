import { AuthGatewayError } from '../../auth/authGateway';
import {
  AdminCatalogRepositoryError,
  type AdminCatalogRepository,
} from '../../data-access/adminCatalog';
import type {
  AdminCatalogDraft,
  AdminCatalogRecord,
  AdminCatalogResourceKind,
  AdminEntityReference,
  AdminGeographicNameReference,
  PublicationStatus,
} from '../../domain/adminCatalog';
import { AUTH_SESSION_STORAGE_KEY, BrowserAuthSessionStorage } from './authSessionStorage';

const HOSTED_PROJECT_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const LOCAL_PROJECT_URL_PATTERN = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/i;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{10,}$/;
const LEGACY_ANON_KEY_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const DEFAULT_TIMEOUT_MS = 8_000;
const PAGE_SIZE = 1000;

interface AdminCatalogRepositoryOptions {
  readonly projectUrl: string;
  readonly publishableKey: string;
  readonly storage?: BrowserAuthSessionStorage;
  readonly fetchImplementation?: typeof fetch;
  readonly timeoutMs?: number;
  readonly now?: () => number;
  readonly allowLocalProject?: boolean;
}

interface AdminTableDefinition {
  readonly table: string;
  readonly select: string;
  readonly order: string;
}

const RESOURCE_TABLES: Readonly<Record<AdminCatalogResourceKind, AdminTableDefinition>> = {
  category: {
    table: 'categories',
    select: 'id,slug,name,description,publication_status,published_at,updated_at',
    order: 'name.asc,id.asc',
  },
  tag: {
    table: 'tags',
    select: 'id,name,description,publication_status,published_at,updated_at',
    order: 'name.asc,id.asc',
  },
  'entity-alias': {
    table: 'entity_aliases',
    select: 'id,entity_id,language,value,publication_status,published_at,updated_at',
    order: 'value.asc,id.asc',
  },
  'geographic-name': {
    table: 'geographic_names',
    select:
      'id,slug,name,language,x,y,recommended_zoom,entity_id,publication_status,published_at,updated_at',
    order: 'name.asc,id.asc',
  },
  'geographic-alias': {
    table: 'geographic_name_aliases',
    select: 'id,geographic_name_id,language,value,publication_status,published_at,updated_at',
    order: 'value.asc,id.asc',
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPublicationStatus(value: unknown): value is PublicationStatus {
  return value === 'draft' || value === 'published' || value === 'archived';
}

function requiredString(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AdminCatalogRepositoryError(
      'invalid-response',
      'Supabase devolvió datos administrativos no válidos.',
    );
  }
  return value;
}

function nullableString(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new AdminCatalogRepositoryError(
      'invalid-response',
      'Supabase devolvió datos administrativos no válidos.',
    );
  }
  return value;
}

function numberValue(row: Record<string, unknown>, field: string): number {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AdminCatalogRepositoryError(
      'invalid-response',
      'Supabase devolvió datos administrativos no válidos.',
    );
  }
  return value;
}

function nullableNumber(row: Record<string, unknown>, field: string): number | null {
  const value = row[field];
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AdminCatalogRepositoryError(
      'invalid-response',
      'Supabase devolvió datos administrativos no válidos.',
    );
  }
  return value;
}

function recordBase(kind: AdminCatalogResourceKind, row: Record<string, unknown>) {
  const publicationStatus = row.publication_status;
  if (!isPublicationStatus(publicationStatus)) {
    throw new AdminCatalogRepositoryError(
      'invalid-response',
      'Supabase devolvió un estado editorial no válido.',
    );
  }

  return {
    kind,
    id: requiredString(row, 'id'),
    publicationStatus,
    publishedAt: nullableString(row, 'published_at'),
    updatedAt: requiredString(row, 'updated_at'),
  } as const;
}

function mapRecord(
  kind: AdminCatalogResourceKind,
  row: Record<string, unknown>,
): AdminCatalogRecord {
  const base = recordBase(kind, row);

  switch (kind) {
    case 'category':
      return {
        ...base,
        kind,
        slug: requiredString(row, 'slug'),
        name: requiredString(row, 'name'),
        description: typeof row.description === 'string' ? row.description : '',
      };
    case 'tag':
      return {
        ...base,
        kind,
        name: requiredString(row, 'name'),
        description: typeof row.description === 'string' ? row.description : '',
      };
    case 'entity-alias':
      if (row.language !== 'en') {
        throw new AdminCatalogRepositoryError(
          'invalid-response',
          'Supabase devolvió un idioma fuera del alcance de Beta 0.2.',
        );
      }
      return {
        ...base,
        kind,
        entityId: requiredString(row, 'entity_id'),
        language: 'en',
        value: requiredString(row, 'value'),
      };
    case 'geographic-name':
      if (row.language !== 'en') {
        throw new AdminCatalogRepositoryError(
          'invalid-response',
          'Supabase devolvió un idioma fuera del alcance de Beta 0.2.',
        );
      }
      return {
        ...base,
        kind,
        slug: requiredString(row, 'slug'),
        name: requiredString(row, 'name'),
        language: 'en',
        x: numberValue(row, 'x'),
        y: numberValue(row, 'y'),
        recommendedZoom: nullableNumber(row, 'recommended_zoom'),
        entityId: nullableString(row, 'entity_id'),
      };
    case 'geographic-alias':
      if (row.language !== 'en') {
        throw new AdminCatalogRepositoryError(
          'invalid-response',
          'Supabase devolvió un idioma fuera del alcance de Beta 0.2.',
        );
      }
      return {
        ...base,
        kind,
        geographicNameId: requiredString(row, 'geographic_name_id'),
        language: 'en',
        value: requiredString(row, 'value'),
      };
  }
}

function draftBody(draft: AdminCatalogDraft): Record<string, unknown> {
  switch (draft.kind) {
    case 'category':
      return {
        id: draft.id,
        slug: draft.slug,
        name: draft.name.trim(),
        description: draft.description,
        publication_status: draft.publicationStatus,
      };
    case 'tag':
      return {
        id: draft.id,
        name: draft.name.trim(),
        description: draft.description,
        publication_status: draft.publicationStatus,
      };
    case 'entity-alias':
      return {
        id: draft.id,
        entity_id: draft.entityId,
        language: 'en',
        value: draft.value.trim(),
        publication_status: draft.publicationStatus,
      };
    case 'geographic-name':
      return {
        id: draft.id,
        slug: draft.slug,
        name: draft.name.trim(),
        language: 'en',
        x: draft.x,
        y: draft.y,
        recommended_zoom: draft.recommendedZoom,
        entity_id: draft.entityId,
        publication_status: draft.publicationStatus,
      };
    case 'geographic-alias':
      return {
        id: draft.id,
        geographic_name_id: draft.geographicNameId,
        language: 'en',
        value: draft.value.trim(),
        publication_status: draft.publicationStatus,
      };
  }
}

function updateBody(draft: AdminCatalogDraft): Record<string, unknown> {
  const { id: _id, ...body } = draftBody(draft);
  return body;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return globalThis.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
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

function parseErrorCode(value: unknown): string | null {
  return isRecord(value) && typeof value.code === 'string' ? value.code : null;
}

export class SupabaseAdminCatalogRepository implements AdminCatalogRepository {
  readonly #projectUrl: string;
  readonly #publishableKey: string;
  readonly #storage: BrowserAuthSessionStorage;
  readonly #fetchImplementation: typeof fetch;
  readonly #timeoutMs: number;
  readonly #now: () => number;

  constructor(options: AdminCatalogRepositoryOptions) {
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
      throw new AdminCatalogRepositoryError(
        'backend-unavailable',
        'La configuración administrativa de Supabase no está disponible.',
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

  async list(
    kind: AdminCatalogResourceKind,
    options: { readonly signal: AbortSignal },
  ): Promise<readonly AdminCatalogRecord[]> {
    const definition = RESOURCE_TABLES[kind];
    const rows = await this.#listRows(
      definition.table,
      definition.select,
      definition.order,
      options.signal,
    );
    return rows.map((row) => mapRecord(kind, row));
  }

  async create(
    draft: AdminCatalogDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminCatalogRecord> {
    const definition = RESOURCE_TABLES[draft.kind];
    const url = this.#tableUrl(definition.table);
    url.searchParams.set('select', definition.select);
    const response = await this.#request(
      url,
      {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(draftBody(draft)),
      },
      options.signal,
    );
    const rows = await this.#readMutationRows(response, 'create');
    if (rows.length !== 1) {
      throw new AdminCatalogRepositoryError(
        'invalid-response',
        'Supabase no confirmó la creación administrativa.',
      );
    }
    return mapRecord(draft.kind, rows[0] as Record<string, unknown>);
  }

  async update(
    original: AdminCatalogRecord,
    draft: AdminCatalogDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminCatalogRecord> {
    if (original.kind !== draft.kind || original.id !== draft.id) {
      throw new AdminCatalogRepositoryError(
        'validation',
        'El tipo y el ID del recurso no pueden cambiar.',
      );
    }
    return this.#patch(original, updateBody(draft), options.signal);
  }

  archive(
    record: AdminCatalogRecord,
    options: { readonly signal: AbortSignal },
  ): Promise<AdminCatalogRecord> {
    return this.#patch(record, { publication_status: 'archived' }, options.signal);
  }

  async delete(
    record: AdminCatalogRecord,
    options: { readonly signal: AbortSignal },
  ): Promise<void> {
    const definition = RESOURCE_TABLES[record.kind];
    const url = this.#tableUrl(definition.table);
    url.searchParams.set('id', `eq.${record.id}`);
    url.searchParams.set('updated_at', `eq.${record.updatedAt}`);
    url.searchParams.set('select', 'id');
    const response = await this.#request(
      url,
      { method: 'DELETE', headers: { Prefer: 'return=representation' } },
      options.signal,
    );
    const rows = await this.#readMutationRows(response, 'delete');
    if (rows.length === 0) {
      throw new AdminCatalogRepositoryError(
        'stale-write',
        'El registro cambió antes de poder eliminarlo. Recarga la lista.',
      );
    }
  }

  async listEntityReferences(options: {
    readonly signal: AbortSignal;
  }): Promise<readonly AdminEntityReference[]> {
    const rows = await this.#listRows(
      'map_entities',
      'id,name,entity_type,publication_status',
      'name.asc,id.asc',
      options.signal,
    );
    return rows.map((row) => {
      const entityType = row.entity_type;
      const publicationStatus = row.publication_status;
      if (
        (entityType !== 'character' && entityType !== 'location') ||
        !isPublicationStatus(publicationStatus)
      ) {
        throw new AdminCatalogRepositoryError(
          'invalid-response',
          'Supabase devolvió una referencia de entidad no válida.',
        );
      }
      return {
        id: requiredString(row, 'id'),
        name: requiredString(row, 'name'),
        entityType,
        publicationStatus,
      };
    });
  }

  async listGeographicNameReferences(options: {
    readonly signal: AbortSignal;
  }): Promise<readonly AdminGeographicNameReference[]> {
    const rows = await this.#listRows(
      'geographic_names',
      'id,name,publication_status',
      'name.asc,id.asc',
      options.signal,
    );
    return rows.map((row) => {
      const publicationStatus = row.publication_status;
      if (!isPublicationStatus(publicationStatus)) {
        throw new AdminCatalogRepositoryError(
          'invalid-response',
          'Supabase devolvió una referencia geográfica no válida.',
        );
      }
      return {
        id: requiredString(row, 'id'),
        name: requiredString(row, 'name'),
        publicationStatus,
      };
    });
  }

  async #patch(
    record: AdminCatalogRecord,
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<AdminCatalogRecord> {
    const definition = RESOURCE_TABLES[record.kind];
    const url = this.#tableUrl(definition.table);
    url.searchParams.set('id', `eq.${record.id}`);
    url.searchParams.set('updated_at', `eq.${record.updatedAt}`);
    url.searchParams.set('select', definition.select);
    const response = await this.#request(
      url,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body),
      },
      signal,
    );
    const rows = await this.#readMutationRows(response, 'update');
    if (rows.length === 0) {
      throw new AdminCatalogRepositoryError(
        'stale-write',
        'El registro cambió mientras lo editabas. Recarga la lista antes de continuar.',
      );
    }
    if (rows.length !== 1) {
      throw new AdminCatalogRepositoryError(
        'invalid-response',
        'Supabase devolvió una respuesta administrativa inesperada.',
      );
    }
    return mapRecord(record.kind, rows[0] as Record<string, unknown>);
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
      const page = await this.#readRows(response);
      const contentRange = response.headers.get('content-range');
      const match = contentRange?.match(/^(?:\*|(\d+)-(\d+))\/(\d+)$/);
      if (!match) {
        throw new AdminCatalogRepositoryError(
          'invalid-response',
          'Supabase no confirmó el tamaño de la colección administrativa.',
        );
      }
      const total = Number(match[3]);
      if (!Number.isSafeInteger(total)) {
        throw new AdminCatalogRepositoryError(
          'invalid-response',
          'Supabase devolvió un tamaño de colección no válido.',
        );
      }
      if (expectedTotal === null) {
        expectedTotal = total;
      } else if (expectedTotal !== total) {
        throw new AdminCatalogRepositoryError(
          'stale-write',
          'El catálogo cambió durante la lectura. Vuelve a cargar la lista.',
        );
      }
      if (total === 0) {
        return [];
      }
      if (Number(match[1]) !== offset || Number(match[2]) !== offset + page.length - 1) {
        throw new AdminCatalogRepositoryError(
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
    const handleAbort = (): void => controller.abort();
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener('abort', handleAbort, { once: true });
    }
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
          throw new AdminCatalogRepositoryError(
            'request-timeout',
            'La operación administrativa superó el tiempo de espera.',
            { cause: error },
          );
        }
        throw new AdminCatalogRepositoryError(
          'backend-unavailable',
          'No se pudo contactar con el servicio administrativo.',
          { cause: error },
        );
      }

      if (response.status === 401) {
        throw new AdminCatalogRepositoryError(
          'session-expired',
          'La sesión administrativa ha caducado. Inicia sesión de nuevo.',
          { status: 401 },
        );
      }
      if (response.status === 403) {
        throw new AdminCatalogRepositoryError(
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
        if (code === '23505') {
          throw new AdminCatalogRepositoryError(
            'conflict',
            'El ID, slug o nombre entra en conflicto con otro registro o con una reserva existente.',
            { status: response.status },
          );
        }
        if (code === '23503') {
          throw new AdminCatalogRepositoryError(
            'referenced',
            'La operación no es posible porque existen relaciones que deben resolverse primero.',
            { status: response.status },
          );
        }
        if (code === '23514') {
          throw new AdminCatalogRepositoryError(
            'operation-prohibited',
            'PostgreSQL rechazó la operación para proteger el ciclo editorial o sus relaciones.',
            { status: response.status },
          );
        }
        if (code === '42501') {
          throw new AdminCatalogRepositoryError(
            'unauthorized',
            'PostgreSQL rechazó la operación administrativa.',
            { status: response.status },
          );
        }
        throw new AdminCatalogRepositoryError(
          response.status >= 500 ? 'backend-unavailable' : 'unexpected',
          'El servicio administrativo rechazó la operación.',
          { status: response.status },
        );
      }

      return response;
    } finally {
      globalThis.clearTimeout(timeout);
      parentSignal.removeEventListener('abort', handleAbort);
    }
  }

  #readAccessToken(): string {
    let serialized: string | null;
    try {
      serialized = this.#storage.getItem(AUTH_SESSION_STORAGE_KEY);
    } catch (error) {
      throw new AdminCatalogRepositoryError(
        'session-expired',
        'No se pudo leer la sesión administrativa de esta pestaña.',
        { cause: error },
      );
    }

    if (!serialized) {
      throw new AdminCatalogRepositoryError(
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
      throw new AdminCatalogRepositoryError(
        'session-expired',
        'La sesión administrativa almacenada no es válida.',
        { cause: error },
      );
    }
  }

  async #readRows(response: Response): Promise<readonly Record<string, unknown>[]> {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new AdminCatalogRepositoryError(
        'invalid-response',
        'Supabase devolvió JSON administrativo no válido.',
        { cause: error },
      );
    }
    if (!Array.isArray(payload) || payload.some((row) => !isRecord(row))) {
      throw new AdminCatalogRepositoryError(
        'invalid-response',
        'Supabase devolvió una colección administrativa no válida.',
      );
    }
    return payload as Record<string, unknown>[];
  }

  async #readMutationRows(
    response: Response,
    operation: 'create' | 'update' | 'delete',
  ): Promise<readonly Record<string, unknown>[]> {
    try {
      return await this.#readRows(response);
    } catch (error) {
      if (error instanceof AuthGatewayError) {
        throw new AdminCatalogRepositoryError(
          'session-expired',
          `La sesión administrativa falló durante ${operation}.`,
          { cause: error },
        );
      }
      throw error;
    }
  }
}
