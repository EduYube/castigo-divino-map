import {
  PublicDataRepositoryError,
  type PublicCatalogEnvelope,
  type PublicCatalogRepository,
} from '../../data-access/publicCatalog';
import { buildPublicCatalogEnvelopeV2 } from './publicCatalogCodec';
import { expectRows, type PublicCatalogTablePayloads } from './publicCatalogRows';

export { parsePublicCatalogSnapshotV2 } from './publicCatalogCodec';

const PROJECT_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const LOCAL_PROJECT_URL_PATTERN = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/i;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{10,}$/;
const LEGACY_ANON_KEY_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const PAGE_SIZE = 1000;

export interface SupabasePublicCatalogRepositoryOptions {
  readonly projectUrl: string;
  readonly publishableKey: string;
  readonly fetchImplementation?: typeof fetch;
  readonly now?: () => number;
  readonly allowLocalProject?: boolean;
}

interface TableQuery {
  readonly name: string;
  readonly select: string;
  readonly order: string;
  readonly published: boolean;
}

interface ParsedContentRange {
  readonly start: number | null;
  readonly end: number | null;
  readonly total: number;
}

const TABLE_QUERIES = {
  categories: {
    name: 'categories',
    select: 'id,slug,name,description',
    order: 'id.asc',
    published: true,
  },
  tags: {
    name: 'tags',
    select: 'id,name,description',
    order: 'id.asc',
    published: true,
  },
  players: {
    name: 'players',
    select: 'id,slug,display_name,name_language',
    order: 'id.asc',
    published: true,
  },
  entities: {
    name: 'map_entities',
    select: 'id,slug,entity_type,visibility,name,name_language,summary,description,x,y,category_id',
    order: 'id.asc',
    published: true,
  },
  entityAliases: {
    name: 'entity_aliases',
    select: 'id,entity_id,language,value',
    order: 'id.asc',
    published: true,
  },
  entityTags: {
    name: 'entity_tags',
    select: 'entity_id,tag_id',
    order: 'entity_id.asc,tag_id.asc',
    published: true,
  },
  dispositions: {
    name: 'entity_player_dispositions',
    select: 'entity_id,player_id,disposition',
    order: 'entity_id.asc,player_id.asc',
    published: false,
  },
  notes: {
    name: 'public_notes',
    select: 'id,slug,entity_id,title,body,sort_order',
    order: 'entity_id.asc,sort_order.asc,id.asc',
    published: true,
  },
  noteTags: {
    name: 'public_note_tags',
    select: 'note_id,tag_id',
    order: 'note_id.asc,tag_id.asc',
    published: true,
  },
  geographicNames: {
    name: 'geographic_names',
    select: 'id,slug,name,language,x,y,recommended_zoom,entity_id',
    order: 'id.asc',
    published: true,
  },
  geographicAliases: {
    name: 'geographic_name_aliases',
    select: 'id,geographic_name_id,language,value',
    order: 'id.asc',
    published: true,
  },
  locationEvents: {
    name: 'character_location_events',
    select:
      'id,character_id,event_type,location_entity_id,geographic_name_id,x,y,location_label,summary,language,observed_at,related_sighting_id',
    order: 'id.asc',
    published: true,
  },
} as const satisfies Record<keyof PublicCatalogTablePayloads, TableQuery>;

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

function partialResponse(message: string): never {
  throw new PublicDataRepositoryError('partial-response', message, { source: 'supabase' });
}

function parseContentRange(value: string | null, table: string): ParsedContentRange {
  if (!value) {
    partialResponse(`Supabase no confirmó el tamaño total de ${table}.`);
  }

  const emptyMatch = /^\*\/(\d+)$/.exec(value);

  if (emptyMatch) {
    const total = Number(emptyMatch[1]);

    if (total !== 0) {
      partialResponse(`Supabase devolvió un rango vacío incoherente para ${table}.`);
    }

    return { start: null, end: null, total };
  }

  const rangeMatch = /^(\d+)-(\d+)\/(\d+)$/.exec(value);

  if (!rangeMatch) {
    partialResponse(`Supabase devolvió un Content-Range no verificable para ${table}.`);
  }

  const start = Number(rangeMatch[1]);
  const end = Number(rangeMatch[2]);
  const total = Number(rangeMatch[3]);

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !Number.isSafeInteger(total)) {
    partialResponse(`Supabase devolvió un Content-Range inválido para ${table}.`);
  }

  if (start < 0 || end < start || total <= end) {
    partialResponse(`Supabase devolvió un Content-Range incoherente para ${table}.`);
  }

  return { start, end, total };
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
      PROJECT_URL_PATTERN.test(projectUrl) || (options.allowLocalProject === true && isLocalProject);
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
    query: TableQuery,
    signal: AbortSignal,
  ): Promise<readonly Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    let expectedTotal: number | null = null;
    let offset = 0;

    do {
      const url = new URL(`${this.#projectUrl}/rest/v1/${query.name}`);
      url.searchParams.set('select', query.select);
      url.searchParams.set('order', query.order);

      if (query.published) {
        url.searchParams.set('publication_status', 'eq.published');
      }

      let response: Response;

      try {
        response = await this.#fetchImplementation(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            apikey: this.#publishableKey,
            Prefer: 'count=exact',
            Range: `${offset}-${offset + PAGE_SIZE - 1}`,
            'Range-Unit': 'items',
          },
          cache: 'no-store',
          signal,
        });
      } catch (error) {
        if (signal.aborted) {
          throw new PublicDataRepositoryError(
            'request-aborted',
            'La consulta pública de Supabase se canceló.',
            { source: 'supabase', cause: error },
          );
        }

        throw new PublicDataRepositoryError(
          'network-unavailable',
          'No se pudo contactar con Supabase.',
          { source: 'supabase', cause: error },
        );
      }

      if (!response.ok) {
        throw new PublicDataRepositoryError(
          response.status === 429 ? 'rate-limited' : 'http-error',
          `Supabase rechazó la consulta pública de ${query.name} (${response.status}).`,
          { source: 'supabase', status: response.status },
        );
      }

      let pageRows: readonly Record<string, unknown>[];

      try {
        pageRows = expectRows(await response.json(), query.name);
      } catch (error) {
        if (error instanceof PublicDataRepositoryError) {
          throw error;
        }

        throw new PublicDataRepositoryError(
          'invalid-response',
          `Supabase devolvió JSON inválido para ${query.name}.`,
          { source: 'supabase', cause: error },
        );
      }

      const contentRange = parseContentRange(response.headers.get('content-range'), query.name);

      if (expectedTotal === null) {
        expectedTotal = contentRange.total;
      } else if (contentRange.total !== expectedTotal) {
        partialResponse(`El total de ${query.name} cambió durante la lectura paginada.`);
      }

      if (expectedTotal === 0) {
        if (pageRows.length !== 0 || contentRange.start !== null || contentRange.end !== null) {
          partialResponse(`Supabase devolvió filas inesperadas para ${query.name}.`);
        }

        return [];
      }

      if (
        pageRows.length === 0 ||
        contentRange.start !== offset ||
        contentRange.end !== offset + pageRows.length - 1
      ) {
        partialResponse(`Supabase devolvió una página incompleta o desalineada para ${query.name}.`);
      }

      rows.push(...pageRows);
      offset += pageRows.length;

      if (offset > expectedTotal) {
        partialResponse(`Supabase devolvió más filas de las declaradas para ${query.name}.`);
      }
    } while (expectedTotal === null || offset < expectedTotal);

    if (rows.length !== expectedTotal) {
      partialResponse(`No se recibió la colección completa de ${query.name}.`);
    }

    return rows;
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
      const entries = Object.entries(TABLE_QUERIES) as [
        keyof PublicCatalogTablePayloads,
        TableQuery,
      ][];
      const responses = await Promise.all(
        entries.map(
          async ([key, query]) => [key, await this.#loadTable(query, controller.signal)] as const,
        ),
      );

      return await buildPublicCatalogEnvelopeV2(
        Object.fromEntries(responses) as unknown as PublicCatalogTablePayloads,
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
