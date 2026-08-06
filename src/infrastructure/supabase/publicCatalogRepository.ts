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

export class SupabasePublicCatalogRepository implements PublicCatalogRepository {
  readonly #projectUrl: string;
  readonly #publishableKey: string;
  readonly #fetchImplementation: typeof fetch;
  readonly #now: () => number;

  constructor(options: SupabasePublicCatalogRepositoryOptions) {
    const projectUrl = options.projectUrl.trim();
    const publishableKey = options.publishableKey.trim();
    const validProjectUrl =
      PROJECT_URL_PATTERN.test(projectUrl) ||
      (options.allowLocalProject === true && LOCAL_PROJECT_URL_PATTERN.test(projectUrl));

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

    if (
      !PUBLISHABLE_KEY_PATTERN.test(publishableKey) &&
      !LEGACY_ANON_KEY_PATTERN.test(publishableKey)
    ) {
      throw new PublicDataRepositoryError(
        'configuration-invalid',
        'La clave configurada no es una clave publicable ni una clave anon compatible.',
        { source: 'supabase', recoverable: false },
      );
    }

    this.#projectUrl = projectUrl.replace(/\/$/, '');
    this.#publishableKey = publishableKey;
    this.#fetchImplementation = options.fetchImplementation ?? fetch;
    this.#now = options.now ?? Date.now;
  }

  async #loadTable(
    query: TableQuery,
    signal: AbortSignal,
  ): Promise<readonly Record<string, unknown>[]> {
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
        headers: { Accept: 'application/json', apikey: this.#publishableKey },
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

    try {
      return expectRows(await response.json(), query.name);
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
  }

  async load(options: { readonly signal: AbortSignal }): Promise<PublicCatalogEnvelope> {
    const entries = Object.entries(TABLE_QUERIES) as [
      keyof PublicCatalogTablePayloads,
      TableQuery,
    ][];
    const responses = await Promise.all(
      entries.map(
        async ([key, query]) => [key, await this.#loadTable(query, options.signal)] as const,
      ),
    );

    return buildPublicCatalogEnvelopeV2(
      Object.fromEntries(responses) as unknown as PublicCatalogTablePayloads,
      this.#now,
    );
  }
}
