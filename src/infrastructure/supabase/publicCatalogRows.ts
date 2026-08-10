import type {
  CharacterEventLocation,
  PublicCategory,
  PublicCharacterLocationEvent,
  PublicEntityAlias,
  PublicEntityPlayerDisposition,
  PublicGeographicName,
  PublicGeographicNameAlias,
  PublicMapEntity,
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

export interface PublicCatalogTablePayloads {
  readonly categories: readonly Record<string, unknown>[];
  readonly tags: readonly Record<string, unknown>[];
  readonly players: readonly Record<string, unknown>[];
  readonly entities: readonly Record<string, unknown>[];
  readonly entityAliases: readonly Record<string, unknown>[];
  readonly entityTags: readonly Record<string, unknown>[];
  readonly dispositions: readonly Record<string, unknown>[];
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

export function parsePlayer(row: Record<string, unknown>, index: number): PublicPlayer {
  const path = `players[${index}]`;
  assertAllowedProperties(row, ['id', 'slug', 'display_name', 'name_language'], path);

  return {
    id: expectString(row.id, `${path}.id`, IDENTIFIER_PATTERNS.player) as PublicPlayer['id'],
    slug: expectString(row.slug, `${path}.slug`, IDENTIFIER_PATTERNS.slug),
    displayName: expectString(row.display_name, `${path}.display_name`),
    nameLanguage: expectEnum(row.name_language, `${path}.name_language`, ['en'] as const),
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
      'visibility',
      'name',
      'name_language',
      'summary',
      'description',
      'x',
      'y',
      'category_id',
    ],
    path,
  );
  const id = expectString(
    row.id,
    `${path}.id`,
    IDENTIFIER_PATTERNS.entity,
  ) as PublicMapEntity['id'];

  return {
    id,
    slug: expectString(row.slug, `${path}.slug`, IDENTIFIER_PATTERNS.slug),
    entityType: expectEnum(row.entity_type, `${path}.entity_type`, [
      'character',
      'location',
    ] as const),
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
    coordinates: {
      x: expectNumber(row.x, `${path}.x`, 0, 3600),
      y: expectNumber(row.y, `${path}.y`, 0, 2329),
    },
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
