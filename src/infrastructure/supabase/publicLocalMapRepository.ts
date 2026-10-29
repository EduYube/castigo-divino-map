import type {
  EntityId,
  PublicCatalogSnapshotV2,
  PublicCoordinate,
  PublicMapGeometry,
  PublicNote,
  PublicSpatialMapEntity,
} from '../../data/beta02-model';
import type { PublicCatalogTableQuery } from '../../data-access/publicCatalogQueryContract.js';
import {
  fetchCompletePublicCatalogTable,
  PUBLIC_CATALOG_TABLE_QUERIES,
  PublicCatalogReadError,
} from '../../data-access/publicCatalogQueryContract.js';
import { PublicDataRepositoryError } from '../../data-access/publicCatalog';
import {
  groupValues,
  parseAssociation,
  parseDisposition,
  parseEntityAlias,
  parseEntityRelation,
  parseEntityTag,
  parseNote,
  parseNoteTag,
} from './publicCatalogRows';
import { parseCharacterLocationRelation } from './publicCharacterLocationRelations';
import { publicPolygonHasSelfIntersection } from './publicPolygonSafety';

export interface PublicLocalContext {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

export interface PublicLocalPlacement {
  readonly contextId: string;
  readonly entityId: EntityId;
  readonly geometry: PublicMapGeometry;
  readonly coordinates: PublicCoordinate;
}

export interface PublicLocalMapData {
  readonly campaignId: string;
  readonly contexts: readonly PublicLocalContext[];
  readonly placements: readonly PublicLocalPlacement[];
  /** Canonical metadata; coordinates are from a published local placement, NEVER the world. */
  readonly localOnlyEntities: readonly PublicSpatialMapEntity[];
  readonly notes: PublicCatalogSnapshotV2['notes'];
  readonly dispositions: PublicCatalogSnapshotV2['dispositions'];
  readonly associations: NonNullable<PublicCatalogSnapshotV2['associations']>;
  readonly entityRelations: NonNullable<PublicCatalogSnapshotV2['entityRelations']>;
  readonly characterLocationRelations: PublicCatalogSnapshotV2['characterLocationRelations'];
}

export const EMPTY_PUBLIC_LOCAL_DATA = (campaignId: string): PublicLocalMapData => ({
  campaignId,
  contexts: [],
  placements: [],
  localOnlyEntities: [],
  notes: [],
  dispositions: [],
  associations: [],
  entityRelations: [],
  characterLocationRelations: [],
});

const IDENTIFIER = /^(?:entity|place)-[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;
const MAP_ID = /^map-[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EPSILON = 1e-9;
const REMOTE_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const LOCAL_URL = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/?$/i;
const TABLES = {
  links: {
    name: 'campaign_geographic_map_context_links',
    select:
      'campaign_id,geographic_name_id,map_context_id,map_contexts!inner(id,slug,name,width,height,publication_status)',
    order: 'geographic_name_id.asc',
    published: false,
    campaignScoped: true,
  },
  placements: {
    name: 'entity_map_placements',
    select: 'campaign_id,map_context_id,entity_id,geometry,x,y,publication_status',
    order: 'map_context_id.asc,entity_id.asc',
    published: true,
    campaignScoped: true,
  },
  localEntities: {
    name: 'map_entities',
    select:
      'id,slug,entity_type,lifecycle_status,visibility,name,name_language,summary,description,portrait_path,x,y,geometry,category_id,world_map_enabled,publication_status,audience',
    order: 'id.asc',
    published: true,
    campaignScoped: true,
    worldMapEnabled: false,
  },
} satisfies Record<string, PublicCatalogTableQuery>;

function invalid(message: string): never {
  throw new PublicDataRepositoryError('invalid-response', message, {
    source: 'supabase',
    recoverable: true,
  });
}

function record(
  value: unknown,
  path: string,
  properties: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid(path + ' no es un objeto.');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !properties.includes(key)))
    invalid(path + ' tiene campos inesperados.');
  return row;
}

function string(value: unknown, path: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value.trim() || (pattern && !pattern.test(value))) {
    invalid(path + ' no es texto público válido.');
  }
  return value;
}

function number(value: unknown, path: string, limit: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > limit) {
    invalid(path + ' está fuera de los límites del mapa.');
  }
  return value;
}

function parseContextLinks(
  rows: readonly Record<string, unknown>[],
  campaignId: string,
): readonly PublicLocalContext[] {
  const unique = new Map<string, PublicLocalContext>();
  for (const [index, link] of rows.entries()) {
    record(link, 'bindings[' + index + ']', [
      'campaign_id',
      'geographic_name_id',
      'map_context_id',
      'map_contexts',
    ]);
    if (link.campaign_id !== campaignId) invalid('Binding de otra campaña.');
    string(link.geographic_name_id, 'binding.geographic_name_id', /^geo-[a-z0-9-]+$/);
    const context = record(link.map_contexts, 'binding.map_contexts', [
      'id',
      'slug',
      'name',
      'width',
      'height',
      'publication_status',
    ]);
    const id = string(context.id, 'context.id', MAP_ID);
    if (link.map_context_id !== id || context.publication_status !== 'published') {
      invalid('Contexto no vinculado o sin publicar.');
    }
    const parsed: PublicLocalContext = {
      id,
      slug: string(context.slug, 'context.slug', SLUG),
      name: string(context.name, 'context.name'),
      width: number(context.width, 'context.width', Number.MAX_SAFE_INTEGER),
      height: number(context.height, 'context.height', Number.MAX_SAFE_INTEGER),
    };
    if (parsed.width === 0 || parsed.height === 0) invalid('Dimensiones inválidas.');
    const previous = unique.get(id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(parsed)) {
      invalid('Metadatos de contexto contradictorios.');
    }
    unique.set(id, parsed);
  }
  return [...unique.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

function parseCoordinates(value: unknown, context: PublicLocalContext): PublicCoordinate {
  const point = record(value, 'geometry.coordinates', ['x', 'y']);
  return {
    x: number(point.x, 'geometry.x', context.width),
    y: number(point.y, 'geometry.y', context.height),
  };
}

export function parsePublicLocalPlacement(
  row: Record<string, unknown>,
  campaignId: string,
  contexts: readonly PublicLocalContext[],
): PublicLocalPlacement {
  record(row, 'placement', [
    'campaign_id',
    'map_context_id',
    'entity_id',
    'geometry',
    'x',
    'y',
    'publication_status',
  ]);
  const context = contexts.find((item) => item.id === row.map_context_id);
  if (row.campaign_id !== campaignId || !context || row.publication_status !== 'published') {
    invalid('Placement sin contexto publicado, binding o campaña válida.');
  }
  const entityId = string(row.entity_id, 'placement.entity_id', IDENTIFIER) as EntityId;
  const geometry = record(row.geometry, 'placement.geometry', ['kind', 'coordinates', 'vertices']);
  let coordinates: PublicCoordinate;
  let parsedGeometry: PublicMapGeometry;
  if (geometry.kind === 'point') {
    record(row.geometry, 'placement.point', ['kind', 'coordinates']);
    coordinates = parseCoordinates(geometry.coordinates, context);
    parsedGeometry = { kind: 'point', coordinates };
  } else if (geometry.kind === 'polygon') {
    record(row.geometry, 'placement.polygon', ['kind', 'vertices']);
    if (
      !Array.isArray(geometry.vertices) ||
      geometry.vertices.length < 3 ||
      geometry.vertices.length > 64
    ) {
      invalid('Polígono local con vértices inválidos.');
    }
    const vertices = geometry.vertices.map((point: unknown) => parseCoordinates(point, context));
    const key = (point: PublicCoordinate): string => point.x + ':' + point.y;
    if (
      new Set(vertices.map(key)).size !== vertices.length ||
      publicPolygonHasSelfIntersection(vertices)
    )
      invalid('Polígono local autointersectado.');
    const area = vertices.reduce((sum, point, index) => {
      const next = vertices[(index + 1) % vertices.length]!;
      return sum + point.x * next.y - next.x * point.y;
    }, 0);
    const first = vertices[0]!;
    if (
      area <= EPSILON ||
      vertices.some((point) => point.x < first.x || (point.x === first.x && point.y < first.y))
    ) {
      invalid('Polígono local no canónico.');
    }
    const xs = vertices.map(({ x }) => x);
    const ys = vertices.map(({ y }) => y);
    coordinates = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
    parsedGeometry = { kind: 'polygon', vertices };
  } else invalid('Tipo de geometría local inválido.');
  if (
    Math.abs(number(row.x, 'placement.x', context.width) - coordinates.x) > EPSILON ||
    Math.abs(number(row.y, 'placement.y', context.height) - coordinates.y) > EPSILON
  ) {
    invalid('Coordenadas representativas no derivadas de geometría.');
  }
  return { contextId: context.id, entityId, geometry: parsedGeometry, coordinates };
}

function parseLocalOnlyEntity(
  row: Record<string, unknown>,
  placement: PublicLocalPlacement,
  aliases: ReturnType<typeof parseEntityAlias>[],
  tags: ReturnType<typeof parseEntityTag>[],
): PublicSpatialMapEntity {
  record(row, 'map_entities local-only', [
    'id',
    'slug',
    'entity_type',
    'lifecycle_status',
    'visibility',
    'name',
    'name_language',
    'summary',
    'description',
    'portrait_path',
    'x',
    'y',
    'geometry',
    'category_id',
    'world_map_enabled',
    'publication_status',
    'audience',
  ]);
  const id = string(row.id, 'entity.id', IDENTIFIER) as EntityId;
  if (
    row.world_map_enabled !== false ||
    row.x !== null ||
    row.y !== null ||
    row.geometry !== null ||
    row.publication_status !== 'published' ||
    row.audience !== 'public' ||
    placement.entityId !== id
  ) {
    invalid('Entidad local-only fuera del contrato canónico.');
  }
  const type = row.entity_type;
  if (type !== 'character' && type !== 'location' && type !== 'mission' && type !== 'hazard') {
    invalid('Una organización no puede ser entidad local espacial.');
  }
  if (type !== 'location' && placement.geometry.kind === 'polygon')
    invalid('Polígono no-location.');
  const lifecycle = row.lifecycle_status;
  if (
    ((type === 'character' || type === 'location') && lifecycle !== null) ||
    (type === 'mission' && !['active', 'completed', 'failed'].includes(lifecycle as string)) ||
    (type === 'hazard' && !['active', 'resolved'].includes(lifecycle as string))
  )
    invalid('Lifecycle inválido.');
  const visibility = row.visibility;
  if (visibility !== 'pin' && visibility !== 'search_only') invalid('Visibilidad inválida.');
  const portrait = row.portrait_path;
  if (
    portrait !== null &&
    (type !== 'character' ||
      typeof portrait !== 'string' ||
      !/^portraits\/[0-9a-f-]+\.(?:jpg|png|webp)$/.test(portrait))
  )
    invalid('Retrato local inválido.');
  if (row.name_language !== 'en') invalid('Idioma local inválido.');
  const entityAliases = aliases.filter((alias) => alias.entityId === id);
  const entityTags = tags.filter((tag) => tag.entityId === id);
  const tagsUnique = new Set(entityTags.map((tag) => tag.tagId));
  if (tagsUnique.size !== entityTags.length) invalid('Etiquetas locales duplicadas.');
  return {
    id,
    slug: string(row.slug, 'entity.slug', SLUG),
    entityType: type,
    lifecycleStatus: lifecycle as PublicSpatialMapEntity['lifecycleStatus'],
    visibility,
    name: string(row.name, 'entity.name'),
    nameLanguage: 'en',
    summary: typeof row.summary === 'string' ? row.summary : invalid('Resumen inválido.'),
    description:
      typeof row.description === 'string' ? row.description : invalid('Descripción inválida.'),
    portraitPath: portrait as string | null,
    categoryId: string(
      row.category_id,
      'entity.category_id',
      /^category-[a-z0-9-]+$/,
    ) as PublicSpatialMapEntity['categoryId'],
    aliases: entityAliases,
    tagIds: [...tagsUnique],
    coordinates: placement.coordinates,
    ...(placement.geometry.kind === 'polygon' ? { geometry: placement.geometry } : {}),
  };
}

export function mergePublicLocalCatalog(
  world: PublicCatalogSnapshotV2,
  local: PublicLocalMapData,
): PublicCatalogSnapshotV2 {
  const worldIds = new Set(world.entities.map((entity) => entity.id));
  if (local.localOnlyEntities.some((entity) => worldIds.has(entity.id))) {
    invalid('Identidad local-only duplicada en world catalog.');
  }
  const allIds = new Set([...worldIds, ...local.localOnlyEntities.map(({ id }) => id)]);
  return {
    ...world,
    entities: [...world.entities, ...local.localOnlyEntities],
    dispositions: [...world.dispositions, ...local.dispositions],
    associations: [...(world.associations ?? []), ...local.associations],
    entityRelations: [
      ...(world.entityRelations ?? []),
      ...local.entityRelations.filter(
        ({ leftEntityId, rightEntityId }) => allIds.has(leftEntityId) && allIds.has(rightEntityId),
      ),
    ],
    characterLocationRelations: [
      ...world.characterLocationRelations,
      ...local.characterLocationRelations.filter(
        ({ characterId, locationId }) => allIds.has(characterId) && allIds.has(locationId),
      ),
    ],
    notes: [...world.notes, ...local.notes],
  };
}

export function projectPublicLocalSurface(
  world: PublicCatalogSnapshotV2,
  local: PublicLocalMapData,
  contextId: string,
): PublicCatalogSnapshotV2 {
  if (!local.contexts.some((context) => context.id === contextId)) invalid('Contexto sin binding.');
  const merged = mergePublicLocalCatalog(world, local);
  const entityById = new Map(merged.entities.map((entity) => [entity.id, entity] as const));
  const entities = local.placements
    .filter((placement) => placement.contextId === contextId)
    .map((placement) => {
      const entity = entityById.get(placement.entityId);
      if (!entity || entity.entityType === 'organization')
        invalid('Placement sin entidad pública espacial.');
      if (entity.entityType !== 'location' && placement.geometry.kind === 'polygon') {
        invalid('Polígono incompatible con entidad canónica.');
      }
      return {
        ...entity,
        coordinates: placement.coordinates,
        geometry: placement.geometry,
      } as PublicSpatialMapEntity;
    });
  return { ...merged, entities };
}

export interface SupabasePublicLocalMapRepositoryOptions {
  readonly projectUrl: string;
  readonly publishableKey: string;
  readonly fetchImplementation?: typeof fetch;
  readonly allowLocalProject?: boolean;
}

export class SupabasePublicLocalMapRepository {
  private readonly projectUrl: string;
  private readonly publishableKey: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: SupabasePublicLocalMapRepositoryOptions) {
    const url = options.projectUrl.trim();
    const key = options.publishableKey.trim();
    if (
      !(REMOTE_URL.test(url) || (options.allowLocalProject && LOCAL_URL.test(url))) ||
      !(
        key.startsWith('sb_publishable_') ||
        (options.allowLocalProject && LOCAL_URL.test(url) && key.length > 20)
      )
    ) {
      throw new PublicDataRepositoryError(
        'configuration-invalid',
        'Configuración pública del mapa local no válida.',
        { source: 'supabase', recoverable: false },
      );
    }
    this.projectUrl = url.replace(/\/$/, '');
    this.publishableKey = key;
    this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
  }

  async load(options: {
    readonly campaignId: string;
    readonly signal: AbortSignal;
    /** Already validated binding results from MAP-077 navigation (same authority). */
    readonly authorizedContexts?: readonly PublicLocalContext[];
  }): Promise<PublicLocalMapData> {
    const { campaignId, signal } = options;
    if (!/^[0-9a-f-]{36}$/.test(campaignId)) invalid('Campaña local inválida.');
    const read = async (
      query: PublicCatalogTableQuery,
    ): Promise<readonly Record<string, unknown>[]> => {
      try {
        return await fetchCompletePublicCatalogTable({
          projectUrl: this.projectUrl,
          publishableKey: this.publishableKey,
          campaignId,
          query,
          signal,
          fetchImplementation: this.fetchImplementation,
        });
      } catch (error) {
        if (error instanceof PublicCatalogReadError) {
          throw new PublicDataRepositoryError(error.kind, error.message, {
            source: 'supabase',
            status: error.status ?? undefined,
            cause: error,
          });
        }
        throw error;
      }
    };
    const contexts =
      options.authorizedContexts ?? parseContextLinks(await read(TABLES.links), campaignId);
    if (contexts.length === 0) return EMPTY_PUBLIC_LOCAL_DATA(campaignId);
    const queries = {
      placements: TABLES.placements,
      entities: TABLES.localEntities,
      entityAliases: PUBLIC_CATALOG_TABLE_QUERIES.entityAliases!,
      entityTags: PUBLIC_CATALOG_TABLE_QUERIES.entityTags!,
      dispositions: PUBLIC_CATALOG_TABLE_QUERIES.dispositions!,
      associations: PUBLIC_CATALOG_TABLE_QUERIES.associations!,
      entityRelations: PUBLIC_CATALOG_TABLE_QUERIES.entityRelations!,
      characterLocationRelations: PUBLIC_CATALOG_TABLE_QUERIES.characterLocationRelations!,
      notes: PUBLIC_CATALOG_TABLE_QUERIES.notes!,
      noteTags: PUBLIC_CATALOG_TABLE_QUERIES.noteTags!,
    };
    const entries = await Promise.all(
      Object.entries(queries).map(async ([key, query]) => [key, await read(query)] as const),
    );
    if (signal.aborted)
      throw new PublicDataRepositoryError('request-aborted', 'Consulta local cancelada.', {
        source: 'supabase',
      });
    const rows = Object.fromEntries(entries) as Record<
      keyof typeof queries,
      readonly Record<string, unknown>[]
    >;
    const placements = rows.placements.map((row) =>
      parsePublicLocalPlacement(row, campaignId, contexts),
    );
    const uniqueKeys = new Set(placements.map((p) => p.contextId + '\u0000' + p.entityId));
    if (uniqueKeys.size !== placements.length) invalid('Placement local duplicado.');
    const aliases = rows.entityAliases.map(parseEntityAlias);
    const tags = rows.entityTags.map(parseEntityTag);
    const localOnlyIds = new Set(
      rows.entities.map((row) => string(row.id, 'entity.id', IDENTIFIER)),
    );
    const firstPlacement = new Map<string, PublicLocalPlacement>();
    for (const placement of placements) {
      if (!firstPlacement.has(placement.entityId))
        firstPlacement.set(placement.entityId, placement);
    }
    const localOnlyEntities = rows.entities.map((row) => {
      const id = string(row.id, 'entity.id', IDENTIFIER);
      const placement = firstPlacement.get(id);
      if (!placement) invalid('Entidad local-only sin placement publicado y vinculado.');
      return parseLocalOnlyEntity(row, placement, aliases, tags);
    });
    const localNotes = rows.notes.filter((row) => localOnlyIds.has(row.entity_id));
    const noteIds = new Set(localNotes.map((note) => note.id));
    const noteTags = rows.noteTags.map(parseNoteTag).filter((tag) => noteIds.has(tag.noteId));
    const noteTagsByNote = groupValues(noteTags, ({ noteId }) => noteId);
    const notes = localNotes.map((row, index) => parseNote(row, index, noteTagsByNote));
    const dispositions = rows.dispositions
      .map(parseDisposition)
      .filter(({ entityId }) => localOnlyIds.has(entityId));
    const associations = rows.associations
      .map(parseAssociation)
      .filter(({ entityId }) => localOnlyIds.has(entityId));
    const entityRelations = rows.entityRelations
      .map(parseEntityRelation)
      .filter(
        ({ leftEntityId, rightEntityId }) =>
          localOnlyIds.has(leftEntityId) || localOnlyIds.has(rightEntityId),
      );
    const characterLocationRelations = rows.characterLocationRelations
      .map(parseCharacterLocationRelation)
      .filter(
        ({ characterId, locationId }) =>
          localOnlyIds.has(characterId) || localOnlyIds.has(locationId),
      );
    if (new Set(localOnlyEntities.map(({ id }) => id)).size !== localOnlyEntities.length) {
      invalid('Entidades local-only duplicadas.');
    }
    return {
      campaignId,
      contexts,
      placements,
      localOnlyEntities,
      notes,
      dispositions,
      associations,
      entityRelations,
      characterLocationRelations,
    };
  }
}
