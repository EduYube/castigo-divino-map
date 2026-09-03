import type {
  CharacterEventLocation,
  PublicCategory,
  PublicCharacterLocationEvent,
  PublicEntityAlias,
  PublicEntityPlayerAssociation,
  PublicEntityPlayerDisposition,
  PublicGeographicName,
  PublicGeographicNameAlias,
  PublicMapEntity,
  PublicMapGeometry,
  PublicNote,
  PublicPlayer,
  PublicTag,
} from '../../data/beta02-model';
import { PublicDataRepositoryError } from '../../data-access/publicCatalog';

const IDENTIFIER_PATTERNS = {
  category: /^category-[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/,
  entity: /^(?:entity|place)-[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/,
  note: /^note-[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/,
  player: /^player-[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/,
  geographicName: /^geo-[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/,
  locationEvent: /^(?:location-event|relation)-[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/,
  slug: /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/,
} as const;
const GEOMETRY_EPSILON = 1e-9;

export interface PublicCatalogTablePayloads {
  readonly categories: readonly Record<string, unknown>[];
  readonly tags: readonly Record<string, unknown>[];
  readonly players: readonly Record<string, unknown>[];
  readonly entities: readonly Record<string, unknown>[];
  readonly entityAliases: readonly Record<string, unknown>[];
  readonly entityTags: readonly Record<string, unknown>[];
  readonly dispositions: readonly Record<string, unknown>[];
  readonly associations: readonly Record<string, unknown>[];
  readonly notes: readonly Record<string, unknown>[];
  readonly noteTags: readonly Record<string, unknown>[];
  readonly geographicNames: readonly Record<string, unknown>[];
  readonly geographicAliases: readonly Record<string, unknown>[];
  readonly locationEvents: readonly Record<string, unknown>[];
}

function invalidResponse(message: string): never {
  throw new PublicDataRepositoryError('invalid-response', message, { source: 'supabase' });
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalidResponse(`${path} debe ser un objeto.`);
  }

  return value as Record<string, unknown>;
}

function assertAllowedProperties(
  record: Record<string, unknown>,
  allowedProperties: readonly string[],
  path: string,
): void {
  const allowed = new Set(allowedProperties);
  const unexpected = Object.keys(record).find((property) => !allowed.has(property));

  if (unexpected) {
    invalidResponse(`${path}.${unexpected} no forma parte de la proyección pública.`);
  }
}

function expectText(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    invalidResponse(`${path} debe ser texto.`);
  }

  return value;
}

function expectString(value: unknown, path: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalidResponse(`${path} debe ser texto no vacío.`);
  }

  if (pattern && !pattern.test(value)) {
    invalidResponse(`${path} no tiene el formato público esperado.`);
  }

  return value;
}

function expectNullableString(value: unknown, path: string): string | null {
  if (value === null) {
    return null;
  }

  return expectString(value, path);
}

function expectNumber(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    invalidResponse(`${path} debe ser un número entre ${minimum} y ${maximum}.`);
  }

  return value;
}

function expectNullableNumber(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null) {
    return null;
  }

  return expectNumber(value, path, minimum, maximum);
}

function expectInteger(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    invalidResponse(`${path} debe ser un entero igual o superior a ${minimum}.`);
  }

  return value;
}

function expectEnum<const Values extends readonly string[]>(
  value: unknown,
  path: string,
  values: Values,
): Values[number] {
  if (typeof value !== 'string' || !values.includes(value)) {
    invalidResponse(`${path} no contiene un valor permitido.`);
  }

  return value as Values[number];
}

function expectIsoDate(value: unknown, path: string): string | null {
  if (value === null) {
    return null;
  }

  const date = expectString(value, path);

  if (!Number.isFinite(Date.parse(date))) {
    invalidResponse(`${path} no contiene una fecha ISO válida.`);
  }

  return date;
}

export function expectRows(value: unknown, table: string): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    invalidResponse(`La respuesta de ${table} debe ser una colección.`);
  }

  return value.map((row, index) => expectRecord(row, `${table}[${index}]`));
}

export function groupValues<Key extends string, Value>(
  values: readonly Value[],
  keyOf: (value: Value) => Key,
): ReadonlyMap<Key, readonly Value[]> {
  const grouped = new Map<Key, Value[]>();

  values.forEach((value) => {
    const key = keyOf(value);
    const group = grouped.get(key) ?? [];
    group.push(value);
    grouped.set(key, group);
  });

  return grouped;
}

export function parseCategory(row: Record<string, unknown>, index: number): PublicCategory {
  const path = `categories[${index}]`;
  assertAllowedProperties(row, ['id', 'slug', 'name', 'description'], path);

  return {
    id: expectString(row.id, `${path}.id`, IDENTIFIER_PATTERNS.category) as PublicCategory['id'],
    slug: expectString(row.slug, `${path}.slug`, IDENTIFIER_PATTERNS.slug),
    name: expectString(row.name, `${path}.name`),
    description: expectText(row.description, `${path}.description`),
  };
}

export function parseTag(row: Record<string, unknown>, index: number): PublicTag {
  const path = `tags[${index}]`;
  assertAllowedProperties(row, ['id', 'name', 'description'], path);

  return {
    id: expectString(row.id, `${path}.id`, IDENTIFIER_PATTERNS.slug),
    name: expectString(row.name, `${path}.name`),
    description: expectText(row.description, `${path}.description`),
  };
}

export type ParsedPublicPlayer = PublicPlayer & { readonly accentColor: string };

export function parsePlayer(row: Record<string, unknown>, index: number): ParsedPublicPlayer {
  const path = `players[${index}]`;
  assertAllowedProperties(
    row,
    ['id', 'slug', 'display_name', 'name_language', 'accent_color'],
    path,
  );

  return {
    id: expectString(row.id, `${path}.id`, IDENTIFIER_PATTERNS.player) as PublicPlayer['id'],
    slug: expectString(row.slug, `${path}.slug`, IDENTIFIER_PATTERNS.slug),
    displayName: expectString(row.display_name, `${path}.display_name`),
    nameLanguage: expectEnum(row.name_language, `${path}.name_language`, ['en'] as const),
    accentColor: expectString(row.accent_color, `${path}.accent_color`, /^#[0-9a-f]{6}$/),
  };
}

export function parseEntityAlias(row: Record<string, unknown>, index: number): PublicEntityAlias {
  const path = `entity_aliases[${index}]`;
  assertAllowedProperties(row, ['id', 'entity_id', 'language', 'value'], path);

  return {
    id: expectString(row.id, `${path}.id`),
    entityId: expectString(
      row.entity_id,
      `${path}.entity_id`,
      IDENTIFIER_PATTERNS.entity,
    ) as PublicEntityAlias['entityId'],
    language: expectEnum(row.language, `${path}.language`, ['en'] as const),
    value: expectString(row.value, `${path}.value`),
  };
}

export interface EntityTagRow {
  readonly entityId: PublicMapEntity['id'];
  readonly tagId: PublicTag['id'];
}

export function parseEntityTag(row: Record<string, unknown>, index: number): EntityTagRow {
  const path = `entity_tags[${index}]`;
  assertAllowedProperties(row, ['entity_id', 'tag_id'], path);

  return {
    entityId: expectString(
      row.entity_id,
      `${path}.entity_id`,
      IDENTIFIER_PATTERNS.entity,
    ) as PublicMapEntity['id'],
    tagId: expectString(row.tag_id, `${path}.tag_id`, IDENTIFIER_PATTERNS.slug),
  };
}

export function parseDisposition(
  row: Record<string, unknown>,
  index: number,
): PublicEntityPlayerDisposition {
  const path = `entity_player_dispositions[${index}]`;
  assertAllowedProperties(row, ['entity_id', 'player_id', 'disposition'], path);

  return {
    entityId: expectString(
      row.entity_id,
      `${path}.entity_id`,
      IDENTIFIER_PATTERNS.entity,
    ) as PublicEntityPlayerDisposition['entityId'],
    playerId: expectString(
      row.player_id,
      `${path}.player_id`,
      IDENTIFIER_PATTERNS.player,
    ) as PublicEntityPlayerDisposition['playerId'],
    disposition: expectEnum(row.disposition, `${path}.disposition`, [
      'ally',
      'enemy',
      'neutral',
    ] as const),
  };
}

export function parseAssociation(
  row: Record<string, unknown>,
  index: number,
): PublicEntityPlayerAssociation {
  const path = `entity_player_associations[${index}]`;
  assertAllowedProperties(row, ['entity_id', 'player_id'], path);

  return {
    entityId: expectString(
      row.entity_id,
      `${path}.entity_id`,
      IDENTIFIER_PATTERNS.entity,
    ) as PublicEntityPlayerAssociation['entityId'],
    playerId: expectString(
      row.player_id,
      `${path}.player_id`,
      IDENTIFIER_PATTERNS.player,
    ) as PublicEntityPlayerAssociation['playerId'],
  };
}

export interface NoteTagRow {
  readonly noteId: PublicNote['id'];
  readonly tagId: PublicTag['id'];
}

export function parseNoteTag(row: Record<string, unknown>, index: number): NoteTagRow {
  const path = `public_note_tags[${index}]`;
  assertAllowedProperties(row, ['note_id', 'tag_id'], path);

  return {
    noteId: expectString(
      row.note_id,
      `${path}.note_id`,
      IDENTIFIER_PATTERNS.note,
    ) as PublicNote['id'],
    tagId: expectString(row.tag_id, `${path}.tag_id`, IDENTIFIER_PATTERNS.slug),
  };
}

export function parseGeographicAlias(
  row: Record<string, unknown>,
  index: number,
): PublicGeographicNameAlias {
  const path = `geographic_name_aliases[${index}]`;
  assertAllowedProperties(row, ['id', 'geographic_name_id', 'language', 'value'], path);

  return {
    id: expectString(row.id, `${path}.id`),
    geographicNameId: expectString(
      row.geographic_name_id,
      `${path}.geographic_name_id`,
      IDENTIFIER_PATTERNS.geographicName,
    ) as PublicGeographicNameAlias['geographicNameId'],
    language: expectEnum(row.language, `${path}.language`, ['en', 'es'] as const),
    value: expectString(row.value, `${path}.value`),
  };
}

function parseGeometryCoordinate(
  value: unknown,
  path: string,
): { readonly x: number; readonly y: number } {
  const coordinate = expectRecord(value, path);
  assertAllowedProperties(coordinate, ['x', 'y'], path);
  return {
    x: expectNumber(coordinate.x, `${path}.x`, 0, 3600),
    y: expectNumber(coordinate.y, `${path}.y`, 0, 2329),
  };
}

function parseEntityGeometry(
  value: unknown,
  path: string,
  entityType: PublicMapEntity['entityType'],
  representative: { readonly x: number; readonly y: number },
): PublicMapGeometry {
  if (value === undefined) {
    return { kind: 'point', coordinates: representative };
  }

  const geometry = expectRecord(value, path);
  const kind = expectEnum(geometry.kind, `${path}.kind`, ['point', 'polygon'] as const);
  if (kind === 'point') {
    assertAllowedProperties(geometry, ['kind', 'coordinates'], path);
    const coordinates = parseGeometryCoordinate(geometry.coordinates, `${path}.coordinates`);
    if (coordinates.x !== representative.x || coordinates.y !== representative.y) {
      invalidResponse(`${path} no coincide con las coordenadas representativas.`);
    }
    return { kind, coordinates };
  }

  assertAllowedProperties(geometry, ['kind', 'vertices'], path);
  if (entityType !== 'location') {
    invalidResponse(`${path} solo permite polígonos para emplazamientos.`);
  }
  if (
    !Array.isArray(geometry.vertices) ||
    geometry.vertices.length < 3 ||
    geometry.vertices.length > 64
  ) {
    invalidResponse(`${path}.vertices debe contener entre 3 y 64 vértices.`);
  }
  const vertices = geometry.vertices.map((vertex, vertexIndex) =>
    parseGeometryCoordinate(vertex, `${path}.vertices[${vertexIndex}]`),
  );
  const duplicate = vertices.some((vertex, vertexIndex) =>
    vertices.some(
      (candidate, candidateIndex) =>
        candidateIndex > vertexIndex && candidate.x === vertex.x && candidate.y === vertex.y,
    ),
  );
  if (duplicate) invalidResponse(`${path}.vertices no puede repetir vértices.`);

  const areaTwice = vertices.reduce((area, vertex, vertexIndex) => {
    const next = vertices[(vertexIndex + 1) % vertices.length]!;
    return area + vertex.x * next.y - next.x * vertex.y;
  }, 0);
  if (areaTwice <= GEOMETRY_EPSILON) {
    invalidResponse(`${path} debe estar serializado canónicamente y tener área positiva.`);
  }
  const first = vertices[0]!;
  if (
    vertices.some((vertex) => vertex.x < first.x || (vertex.x === first.x && vertex.y < first.y))
  ) {
    invalidResponse(`${path} no comienza en su vértice canónico.`);
  }

  const xs = vertices.map(({ x }) => x);
  const ys = vertices.map(({ y }) => y);
  const expectedRepresentative = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
  if (
    Math.abs(expectedRepresentative.x - representative.x) > GEOMETRY_EPSILON ||
    Math.abs(expectedRepresentative.y - representative.y) > GEOMETRY_EPSILON
  ) {
    invalidResponse(`${path} no coincide con su punto representativo derivado.`);
  }
  return { kind, vertices };
}

export function parseEntity(
  row: Record<string, unknown>,
  index: number,
  aliasesByEntity: ReadonlyMap<PublicMapEntity['id'], readonly PublicEntityAlias[]>,
  tagsByEntity: ReadonlyMap<PublicMapEntity['id'], readonly EntityTagRow[]>,
): PublicMapEntity {
  const path = `map_entities[${index}]`;
  assertAllowedProperties(
    row,
    [
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
    ],
    path,
  );
  const id = expectString(
    row.id,
    `${path}.id`,
    IDENTIFIER_PATTERNS.entity,
  ) as PublicMapEntity['id'];

  const parsedEntityType = expectEnum(row.entity_type, `${path}.entity_type`, [
    'character',
    'location',
    'mission',
    'hazard',
  ] as const);
  const parsedLifecycle =
    row.lifecycle_status == null
      ? null
      : expectEnum(row.lifecycle_status, `${path}.lifecycle_status`, [
          'active',
          'completed',
          'failed',
          'resolved',
        ] as const);
  if (
    (parsedEntityType === 'character' || parsedEntityType === 'location') &&
    parsedLifecycle !== null
  ) {
    invalidResponse(`${path}.lifecycle_status no corresponde a esta clase funcional.`);
  }
  if (
    parsedEntityType === 'mission' &&
    !['active', 'completed', 'failed'].includes(parsedLifecycle ?? '')
  ) {
    invalidResponse(`${path}.lifecycle_status no es válido para una misión.`);
  }
  if (parsedEntityType === 'hazard' && !['active', 'resolved'].includes(parsedLifecycle ?? '')) {
    invalidResponse(`${path}.lifecycle_status no es válido para un peligro.`);
  }
  const hasPortraitPath = Object.prototype.hasOwnProperty.call(row, 'portrait_path');
  const portraitPath =
    row.portrait_path == null
      ? null
      : expectString(
          row.portrait_path,
          `${path}.portrait_path`,
          /^portraits\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/,
        );
  if (portraitPath !== null && parsedEntityType !== 'character') {
    invalidResponse(`${path}.portrait_path solo puede pertenecer a un personaje.`);
  }
  const coordinates = {
    x: expectNumber(row.x, `${path}.x`, 0, 3600),
    y: expectNumber(row.y, `${path}.y`, 0, 2329),
  };
  const geometry = parseEntityGeometry(
    row.geometry,
    `${path}.geometry`,
    parsedEntityType,
    coordinates,
  );

  return {
    id,
    slug: expectString(row.slug, `${path}.slug`, IDENTIFIER_PATTERNS.slug),
    entityType: parsedEntityType,
    lifecycleStatus: parsedLifecycle,
    visibility: expectEnum(row.visibility, `${path}.visibility`, ['pin', 'search_only'] as const),
    name: expectString(row.name, `${path}.name`),
    nameLanguage: expectEnum(row.name_language, `${path}.name_language`, ['en'] as const),
    aliases: aliasesByEntity.get(id) ?? [],
    summary:
      typeof row.summary === 'string'
        ? row.summary
        : invalidResponse(`${path}.summary debe ser texto.`),
    description:
      typeof row.description === 'string'
        ? row.description
        : invalidResponse(`${path}.description debe ser texto.`),
    ...(hasPortraitPath ? { portraitPath } : {}),
    ...(geometry.kind === 'polygon' ? { geometry } : {}),
    coordinates,
    categoryId: expectString(
      row.category_id,
      `${path}.category_id`,
      IDENTIFIER_PATTERNS.category,
    ) as PublicMapEntity['categoryId'],
    tagIds: (tagsByEntity.get(id) ?? []).map(({ tagId }) => tagId),
  };
}

export function parseNote(
  row: Record<string, unknown>,
  index: number,
  tagsByNote: ReadonlyMap<PublicNote['id'], readonly NoteTagRow[]>,
): PublicNote {
  const path = `public_notes[${index}]`;
  assertAllowedProperties(row, ['id', 'slug', 'entity_id', 'title', 'body', 'sort_order'], path);
  const id = expectString(row.id, `${path}.id`, IDENTIFIER_PATTERNS.note) as PublicNote['id'];

  return {
    id,
    slug: expectString(row.slug, `${path}.slug`, IDENTIFIER_PATTERNS.slug),
    entityId: expectString(
      row.entity_id,
      `${path}.entity_id`,
      IDENTIFIER_PATTERNS.entity,
    ) as PublicNote['entityId'],
    title: expectString(row.title, `${path}.title`),
    body: expectString(row.body, `${path}.body`),
    sortOrder: expectInteger(row.sort_order, `${path}.sort_order`),
    tagIds: (tagsByNote.get(id) ?? []).map(({ tagId }) => tagId),
  };
}

export function parseGeographicName(
  row: Record<string, unknown>,
  index: number,
  aliasesByName: ReadonlyMap<PublicGeographicName['id'], readonly PublicGeographicNameAlias[]>,
): PublicGeographicName {
  const path = `geographic_names[${index}]`;
  assertAllowedProperties(
    row,
    ['id', 'slug', 'name', 'language', 'x', 'y', 'recommended_zoom', 'entity_id'],
    path,
  );
  const id = expectString(
    row.id,
    `${path}.id`,
    IDENTIFIER_PATTERNS.geographicName,
  ) as PublicGeographicName['id'];
  const entityId =
    row.entity_id === null
      ? null
      : (expectString(
          row.entity_id,
          `${path}.entity_id`,
          IDENTIFIER_PATTERNS.entity,
        ) as PublicGeographicName['entityId']);

  return {
    id,
    slug: expectString(row.slug, `${path}.slug`, IDENTIFIER_PATTERNS.slug),
    name: expectString(row.name, `${path}.name`),
    language: expectEnum(row.language, `${path}.language`, ['en'] as const),
    aliases: aliasesByName.get(id) ?? [],
    coordinates: {
      x: expectNumber(row.x, `${path}.x`, 0, 3600),
      y: expectNumber(row.y, `${path}.y`, 0, 2329),
    },
    recommendedZoom: expectNullableNumber(row.recommended_zoom, `${path}.recommended_zoom`, -5, 10),
    entityId,
  };
}

export function parseLocationEvent(
  row: Record<string, unknown>,
  index: number,
): PublicCharacterLocationEvent {
  const path = `character_location_events[${index}]`;
  assertAllowedProperties(
    row,
    [
      'id',
      'character_id',
      'event_type',
      'location_entity_id',
      'geographic_name_id',
      'x',
      'y',
      'location_label',
      'summary',
      'language',
      'observed_at',
      'related_sighting_id',
    ],
    path,
  );
  const eventType = expectEnum(row.event_type, `${path}.event_type`, [
    'sighting',
    'departure',
  ] as const);
  const locationEntityId =
    row.location_entity_id === null
      ? null
      : (expectString(
          row.location_entity_id,
          `${path}.location_entity_id`,
          IDENTIFIER_PATTERNS.entity,
        ) as PublicMapEntity['id']);
  const geographicNameId =
    row.geographic_name_id === null
      ? null
      : (expectString(
          row.geographic_name_id,
          `${path}.geographic_name_id`,
          IDENTIFIER_PATTERNS.geographicName,
        ) as PublicGeographicName['id']);
  const x = expectNullableNumber(row.x, `${path}.x`, 0, 3600);
  const y = expectNullableNumber(row.y, `${path}.y`, 0, 2329);

  if ((x === null) !== (y === null)) {
    invalidResponse(`${path} debe proporcionar las dos coordenadas o ninguna.`);
  }

  if (locationEntityId === null && geographicNameId === null && x === null) {
    invalidResponse(`${path} no contiene ninguna fuente de ubicación.`);
  }

  const location: CharacterEventLocation =
    locationEntityId !== null
      ? {
          locationEntityId,
          geographicNameId,
          coordinates: x === null || y === null ? null : { x, y },
          locationLabel: expectNullableString(row.location_label, `${path}.location_label`),
        }
      : geographicNameId !== null
        ? {
            locationEntityId: null,
            geographicNameId,
            coordinates: x === null || y === null ? null : { x, y },
            locationLabel: expectNullableString(row.location_label, `${path}.location_label`),
          }
        : {
            locationEntityId: null,
            geographicNameId: null,
            coordinates: { x: x as number, y: y as number },
            locationLabel: expectNullableString(row.location_label, `${path}.location_label`),
          };
  const base = {
    id: expectString(
      row.id,
      `${path}.id`,
      IDENTIFIER_PATTERNS.locationEvent,
    ) as PublicCharacterLocationEvent['id'],
    characterId: expectString(
      row.character_id,
      `${path}.character_id`,
      IDENTIFIER_PATTERNS.entity,
    ) as PublicCharacterLocationEvent['characterId'],
    location,
    summary:
      typeof row.summary === 'string'
        ? row.summary
        : invalidResponse(`${path}.summary debe ser texto.`),
    language: expectEnum(row.language, `${path}.language`, ['en'] as const),
    observedAt: expectIsoDate(row.observed_at, `${path}.observed_at`),
  } as const;

  if (eventType === 'sighting') {
    if (row.related_sighting_id !== null) {
      invalidResponse(`${path}.related_sighting_id debe ser nulo para un avistamiento.`);
    }

    return { ...base, eventType, relatedSightingId: null };
  }

  return {
    ...base,
    eventType,
    relatedSightingId:
      row.related_sighting_id === null
        ? null
        : (expectString(
            row.related_sighting_id,
            `${path}.related_sighting_id`,
            IDENTIFIER_PATTERNS.locationEvent,
          ) as PublicCharacterLocationEvent['relatedSightingId']),
  };
}
