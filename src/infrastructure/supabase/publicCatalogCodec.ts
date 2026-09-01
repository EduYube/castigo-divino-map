import type { PublicCatalogSnapshotV2 } from '../../data/beta02-model';
import {
  PublicDataRepositoryError,
  createSha256Checksum,
  type PublicCatalogEnvelope,
} from '../../data-access/publicCatalog';
import {
  parseCharacterLocationRelation,
  relationSnapshotRows,
  type PublicCatalogTablePayloadsWithCharacterLocations,
} from './publicCharacterLocationRelations';
import { parseGeographicNameWithExtent } from './geographicSearchExtentRows';
import {
  groupValues,
  parseAssociation,
  parseCategory,
  parseDisposition,
  parseEntity,
  parseEntityAlias,
  parseEntityTag,
  parseGeographicAlias,
  parseLocationEvent,
  parseNote,
  parseNoteTag,
  parsePlayer,
  parseTag,
} from './publicCatalogRows';
import { publicPolygonHasSelfIntersection } from './publicPolygonSafety';

const HISTORIC_PLAYER_ACCENT = '#475569';

type NormalizedPublicPlayer = PublicCatalogSnapshotV2['players'][number] & {
  readonly accentColor: string;
};

type PublicCatalogContentV2 = Omit<
  PublicCatalogSnapshotV2,
  'generatedAt' | 'sourceRevision' | 'checksum' | 'players' | 'associations'
> & {
  readonly players: readonly NormalizedPublicPlayer[];
  readonly associations: NonNullable<PublicCatalogSnapshotV2['associations']>;
};

function invalidResponse(message: string): never {
  throw new PublicDataRepositoryError('invalid-response', message, { source: 'supabase' });
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalidResponse(`${path} debe ser un objeto.`);
  }

  return value as Record<string, unknown>;
}

function expectRecords(value: unknown, path: string): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    invalidResponse(`${path} debe ser una colección.`);
  }

  return value.map((entry, index) => expectRecord(entry, `${path}[${index}]`));
}

function expectValues(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    invalidResponse(`${path} debe ser una colección.`);
  }

  return value;
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

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalidResponse(`${path} debe ser texto no vacío.`);
  }

  return value;
}

function expectChecksum(value: unknown, path: string): string {
  const checksum = expectString(value, path);

  if (!/^sha256:[0-9a-f]{64}$/.test(checksum)) {
    invalidResponse(`${path} no contiene un SHA-256 válido.`);
  }

  return checksum;
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();

  values.forEach((value) => {
    if (seen.has(value)) {
      invalidResponse(`${label} contiene el identificador duplicado “${value}”.`);
    }

    seen.add(value);
  });
}

function assertReferences(snapshot: PublicCatalogContentV2): void {
  const categoryValues = snapshot.categories.map(({ id }) => id);
  const tagValues = snapshot.tags.map(({ id }) => id);
  const playerValues = snapshot.players.map(({ id }) => id);
  const entityValues = snapshot.entities.map(({ id }) => id);
  const noteValues = snapshot.notes.map(({ id }) => id);
  const geographicNameValues = snapshot.geographicNames.map(({ id }) => id);
  const eventValues = snapshot.characterLocationEvents.map(({ id }) => id);

  assertUnique(categoryValues, 'categories');
  assertUnique(tagValues, 'tags');
  assertUnique(playerValues, 'players');
  assertUnique(entityValues, 'entities');
  assertUnique(noteValues, 'notes');
  assertUnique(geographicNameValues, 'geographicNames');
  assertUnique(eventValues, 'characterLocationEvents');
  assertUnique(
    snapshot.entities.flatMap(({ aliases }) => aliases.map(({ id }) => id)),
    'entityAliases',
  );
  assertUnique(
    snapshot.geographicNames.flatMap(({ aliases }) => aliases.map(({ id }) => id)),
    'geographicNameAliases',
  );
  assertUnique(
    snapshot.dispositions.map(({ entityId, playerId }) => `${entityId}\u0000${playerId}`),
    'dispositions',
  );
  assertUnique(
    snapshot.associations.map(({ entityId, playerId }) => `${entityId}\u0000${playerId}`),
    'associations',
  );
  assertUnique(
    snapshot.characterLocationRelations.map(
      ({ characterId, locationId }) => `${characterId}\u0000${locationId}`,
    ),
    'characterLocationRelations',
  );

  const categoryIds = new Set(categoryValues);
  const tagIds = new Set(tagValues);
  const playerIds = new Set(playerValues);
  const entitiesById = new Map(snapshot.entities.map((entity) => [entity.id, entity] as const));
  const geographicNamesById = new Map(
    snapshot.geographicNames.map((name) => [name.id, name] as const),
  );
  const eventsById = new Map(
    snapshot.characterLocationEvents.map((event) => [event.id, event] as const),
  );

  snapshot.entities.forEach((entity) => {
    if (!categoryIds.has(entity.categoryId)) {
      invalidResponse(`La entidad “${entity.id}” referencia una categoría ausente.`);
    }
    if (
      entity.geometry?.kind === 'polygon' &&
      publicPolygonHasSelfIntersection(entity.geometry.vertices)
    ) {
      invalidResponse(`La geometría pública de “${entity.id}” no puede autointersectarse.`);
    }

    assertUnique(entity.tagIds, `entities.${entity.id}.tagIds`);
    entity.tagIds.forEach((tagId) => {
      if (!tagIds.has(tagId)) {
        invalidResponse(`La entidad “${entity.id}” referencia una etiqueta ausente.`);
      }
    });
    entity.aliases.forEach((alias) => {
      if (alias.entityId !== entity.id) {
        invalidResponse(`El alias “${alias.id}” no coincide con su entidad contenedora.`);
      }
    });
  });

  snapshot.dispositions.forEach((disposition) => {
    if (!entitiesById.has(disposition.entityId) || !playerIds.has(disposition.playerId)) {
      invalidResponse('Una disposición pública referencia un extremo ausente.');
    }
  });

  snapshot.associations.forEach((association) => {
    if (!entitiesById.has(association.entityId) || !playerIds.has(association.playerId)) {
      invalidResponse('Una asociación pública referencia un extremo ausente.');
    }
  });

  snapshot.characterLocationRelations.forEach((relation) => {
    const character = entitiesById.get(relation.characterId);
    const location = entitiesById.get(relation.locationId);
    if (!character || character.entityType !== 'character') {
      invalidResponse(
        'Una relación personaje–emplazamiento referencia un personaje ausente o incompatible.',
      );
    }
    if (!location || location.entityType !== 'location') {
      invalidResponse(
        'Una relación personaje–emplazamiento referencia un emplazamiento ausente o incompatible.',
      );
    }
  });

  snapshot.notes.forEach((note) => {
    if (!entitiesById.has(note.entityId)) {
      invalidResponse(`La nota “${note.id}” referencia una entidad ausente.`);
    }

    assertUnique(note.tagIds, `notes.${note.id}.tagIds`);
    note.tagIds.forEach((tagId) => {
      if (!tagIds.has(tagId)) {
        invalidResponse(`La nota “${note.id}” referencia una etiqueta ausente.`);
      }
    });
  });

  snapshot.geographicNames.forEach((name) => {
    if (name.entityId !== null) {
      const entity = entitiesById.get(name.entityId);

      if (!entity) {
        invalidResponse(`El nombre geográfico “${name.id}” referencia una entidad ausente.`);
      }

      if (entity.entityType !== 'location') {
        invalidResponse(`El nombre geográfico “${name.id}” debe referenciar una ubicación.`);
      }
    }

    name.aliases.forEach((alias) => {
      if (alias.geographicNameId !== name.id) {
        invalidResponse(`El alias geográfico “${alias.id}” no coincide con su contenedor.`);
      }
    });
  });

  snapshot.characterLocationEvents.forEach((event) => {
    const character = entitiesById.get(event.characterId);

    if (!character) {
      invalidResponse(`El acontecimiento “${event.id}” referencia un personaje ausente.`);
    }

    if (character.entityType !== 'character') {
      invalidResponse(`El acontecimiento “${event.id}” no referencia una entidad personaje.`);
    }

    if (event.location.locationEntityId !== null) {
      const location = entitiesById.get(event.location.locationEntityId);

      if (!location) {
        invalidResponse(`El acontecimiento “${event.id}” referencia una ubicación ausente.`);
      }

      if (location.entityType !== 'location') {
        invalidResponse(`El acontecimiento “${event.id}” no referencia una entidad ubicación.`);
      }
    }

    if (
      event.location.geographicNameId !== null &&
      !geographicNamesById.has(event.location.geographicNameId)
    ) {
      invalidResponse(`El acontecimiento “${event.id}” referencia un nombre geográfico ausente.`);
    }

    if (event.relatedSightingId !== null) {
      const relatedEvent = eventsById.get(event.relatedSightingId);

      if (!relatedEvent || relatedEvent.eventType !== 'sighting') {
        invalidResponse(`El acontecimiento “${event.id}” referencia un avistamiento inválido.`);
      }
    }
  });
}

function assertRelationRows(
  content: PublicCatalogContentV2,
  relations: {
    readonly entityAliases: ReturnType<typeof parseEntityAlias>[];
    readonly entityTags: ReturnType<typeof parseEntityTag>[];
    readonly noteTags: ReturnType<typeof parseNoteTag>[];
    readonly geographicAliases: ReturnType<typeof parseGeographicAlias>[];
  },
): void {
  const entityIds = new Set(content.entities.map(({ id }) => id));
  const tagIds = new Set(content.tags.map(({ id }) => id));
  const noteIds = new Set(content.notes.map(({ id }) => id));
  const geographicNameIds = new Set(content.geographicNames.map(({ id }) => id));

  relations.entityAliases.forEach((alias) => {
    if (!entityIds.has(alias.entityId)) {
      invalidResponse(`El alias “${alias.id}” referencia una entidad ausente.`);
    }
  });
  relations.entityTags.forEach(({ entityId, tagId }) => {
    if (!entityIds.has(entityId) || !tagIds.has(tagId)) {
      invalidResponse('Una relación entidad-etiqueta referencia un extremo ausente.');
    }
  });
  relations.noteTags.forEach(({ noteId, tagId }) => {
    if (!noteIds.has(noteId) || !tagIds.has(tagId)) {
      invalidResponse('Una relación nota-etiqueta referencia un extremo ausente.');
    }
  });
  relations.geographicAliases.forEach((alias) => {
    if (!geographicNameIds.has(alias.geographicNameId)) {
      invalidResponse(`El alias geográfico “${alias.id}” referencia un nombre ausente.`);
    }
  });
}

function buildPublicCatalogContentV2(
  payloads: PublicCatalogTablePayloadsWithCharacterLocations,
): PublicCatalogContentV2 {
  const categories = payloads.categories.map(parseCategory);
  const tags = payloads.tags.map(parseTag);
  const players = payloads.players.map(parsePlayer);
  const entityAliases = payloads.entityAliases.map(parseEntityAlias);
  const entityTags = payloads.entityTags.map(parseEntityTag);
  const dispositions = payloads.dispositions.map(parseDisposition);
  const associations = payloads.associations.map(parseAssociation);
  const characterLocationRelations = payloads.characterLocationRelations.map(
    parseCharacterLocationRelation,
  );
  const noteTags = payloads.noteTags.map(parseNoteTag);
  const geographicAliases = payloads.geographicAliases.map(parseGeographicAlias);
  const aliasesByEntity = groupValues(entityAliases, ({ entityId }) => entityId);
  const tagsByEntity = groupValues(entityTags, ({ entityId }) => entityId);
  const tagsByNote = groupValues(noteTags, ({ noteId }) => noteId);
  const aliasesByName = groupValues(geographicAliases, ({ geographicNameId }) => geographicNameId);
  const entities = payloads.entities.map((row, index) =>
    parseEntity(row, index, aliasesByEntity, tagsByEntity),
  );
  const notes = payloads.notes.map((row, index) => parseNote(row, index, tagsByNote));
  const geographicNames = payloads.geographicNames.map((row, index) =>
    parseGeographicNameWithExtent(row, index, aliasesByName),
  );
  const characterLocationEvents = payloads.locationEvents.map(parseLocationEvent);
  const content: PublicCatalogContentV2 = {
    schemaVersion: 2,
    categories,
    tags,
    players,
    entities,
    dispositions,
    associations,
    characterLocationRelations,
    notes,
    geographicNames,
    characterLocationEvents,
  };

  assertRelationRows(content, { entityAliases, entityTags, noteTags, geographicAliases });
  assertReferences(content);

  return content;
}

function snapshotPayloads(
  record: Record<string, unknown>,
): PublicCatalogTablePayloadsWithCharacterLocations {
  const categories = expectRecords(record.categories, 'snapshot.categories').map(
    (category, index) => {
      const path = `snapshot.categories[${index}]`;
      assertAllowedProperties(category, ['id', 'slug', 'name', 'description'], path);
      return category;
    },
  );
  const tags = expectRecords(record.tags, 'snapshot.tags').map((tag, index) => {
    const path = `snapshot.tags[${index}]`;
    assertAllowedProperties(tag, ['id', 'name', 'description'], path);
    return tag;
  });
  const players = expectRecords(record.players, 'snapshot.players').map((player, index) => {
    const path = `snapshot.players[${index}]`;
    assertAllowedProperties(
      player,
      ['id', 'slug', 'displayName', 'nameLanguage', 'accentColor'],
      path,
    );
    return {
      id: player.id,
      slug: player.slug,
      display_name: player.displayName,
      name_language: player.nameLanguage,
      accent_color: player.accentColor ?? HISTORIC_PLAYER_ACCENT,
    };
  });
  const entityAliases: Record<string, unknown>[] = [];
  const entityTags: Record<string, unknown>[] = [];
  const entities = expectRecords(record.entities, 'snapshot.entities').map((entity, index) => {
    const path = `snapshot.entities[${index}]`;
    assertAllowedProperties(
      entity,
      [
        'id',
        'slug',
        'entityType',
        'visibility',
        'name',
        'nameLanguage',
        'aliases',
        'summary',
        'description',
        'portraitPath',
        'coordinates',
        'geometry',
        'categoryId',
        'tagIds',
      ],
      path,
    );
    const coordinates = expectRecord(entity.coordinates, `${path}.coordinates`);
    assertAllowedProperties(coordinates, ['x', 'y'], `${path}.coordinates`);
    expectRecords(entity.aliases, `${path}.aliases`).forEach((alias, aliasIndex) => {
      const aliasPath = `${path}.aliases[${aliasIndex}]`;
      assertAllowedProperties(alias, ['id', 'entityId', 'language', 'value'], aliasPath);

      if (alias.entityId !== entity.id) {
        invalidResponse(`${aliasPath}.entityId no coincide con su entidad contenedora.`);
      }

      entityAliases.push({
        id: alias.id,
        entity_id: alias.entityId,
        language: alias.language,
        value: alias.value,
      });
    });
    expectValues(entity.tagIds, `${path}.tagIds`).forEach((tagId) => {
      entityTags.push({ entity_id: entity.id, tag_id: tagId });
    });

    return {
      id: entity.id,
      slug: entity.slug,
      entity_type: entity.entityType,
      visibility: entity.visibility,
      name: entity.name,
      name_language: entity.nameLanguage,
      summary: entity.summary,
      description: entity.description,
      ...(Object.prototype.hasOwnProperty.call(entity, 'portraitPath')
        ? { portrait_path: entity.portraitPath ?? null }
        : {}),
      x: coordinates.x,
      y: coordinates.y,
      ...(Object.prototype.hasOwnProperty.call(entity, 'geometry')
        ? { geometry: entity.geometry }
        : {}),
      category_id: entity.categoryId,
    };
  });
  const dispositions = expectRecords(record.dispositions, 'snapshot.dispositions').map(
    (disposition, index) => {
      const path = `snapshot.dispositions[${index}]`;
      assertAllowedProperties(disposition, ['entityId', 'playerId', 'disposition'], path);
      return {
        entity_id: disposition.entityId,
        player_id: disposition.playerId,
        disposition: disposition.disposition,
      };
    },
  );
  const associations =
    record.associations === undefined
      ? []
      : expectRecords(record.associations, 'snapshot.associations').map((association, index) => {
          const path = `snapshot.associations[${index}]`;
          assertAllowedProperties(association, ['entityId', 'playerId'], path);
          return {
            entity_id: association.entityId,
            player_id: association.playerId,
          };
        });
  const characterLocationRelations = relationSnapshotRows(record.characterLocationRelations);
  const noteTags: Record<string, unknown>[] = [];
  const notes = expectRecords(record.notes, 'snapshot.notes').map((note, index) => {
    const path = `snapshot.notes[${index}]`;
    assertAllowedProperties(
      note,
      ['id', 'slug', 'entityId', 'title', 'body', 'sortOrder', 'tagIds'],
      path,
    );
    expectValues(note.tagIds, `${path}.tagIds`).forEach((tagId) => {
      noteTags.push({ note_id: note.id, tag_id: tagId });
    });

    return {
      id: note.id,
      slug: note.slug,
      entity_id: note.entityId,
      title: note.title,
      body: note.body,
      sort_order: note.sortOrder,
    };
  });
  const geographicAliases: Record<string, unknown>[] = [];
  const geographicNames = expectRecords(record.geographicNames, 'snapshot.geographicNames').map(
    (name, index) => {
      const path = `snapshot.geographicNames[${index}]`;
      assertAllowedProperties(
        name,
        [
          'id',
          'slug',
          'name',
          'language',
          'aliases',
          'coordinates',
          'searchExtent',
          'recommendedZoom',
          'entityId',
        ],
        path,
      );
      const coordinates = expectRecord(name.coordinates, `${path}.coordinates`);
      assertAllowedProperties(coordinates, ['x', 'y'], `${path}.coordinates`);
      const searchExtent =
        name.searchExtent == null ? null : expectRecord(name.searchExtent, `${path}.searchExtent`);
      if (searchExtent) {
        assertAllowedProperties(
          searchExtent,
          ['minX', 'maxX', 'minY', 'maxY'],
          `${path}.searchExtent`,
        );
      }
      expectRecords(name.aliases, `${path}.aliases`).forEach((alias, aliasIndex) => {
        const aliasPath = `${path}.aliases[${aliasIndex}]`;
        assertAllowedProperties(alias, ['id', 'geographicNameId', 'language', 'value'], aliasPath);

        if (alias.geographicNameId !== name.id) {
          invalidResponse(`${aliasPath}.geographicNameId no coincide con su contenedor.`);
        }

        geographicAliases.push({
          id: alias.id,
          geographic_name_id: alias.geographicNameId,
          language: alias.language,
          value: alias.value,
        });
      });

      return {
        id: name.id,
        slug: name.slug,
        name: name.name,
        language: name.language,
        x: coordinates.x,
        y: coordinates.y,
        recommended_zoom: name.recommendedZoom,
        entity_id: name.entityId,
        search_min_x: searchExtent?.minX ?? null,
        search_max_x: searchExtent?.maxX ?? null,
        search_min_y: searchExtent?.minY ?? null,
        search_max_y: searchExtent?.maxY ?? null,
      };
    },
  );
  const locationEvents = expectRecords(
    record.characterLocationEvents,
    'snapshot.characterLocationEvents',
  ).map((event, index) => {
    const path = `snapshot.characterLocationEvents[${index}]`;
    assertAllowedProperties(
      event,
      [
        'id',
        'characterId',
        'eventType',
        'location',
        'summary',
        'language',
        'observedAt',
        'relatedSightingId',
      ],
      path,
    );
    const location = expectRecord(event.location, `${path}.location`);
    assertAllowedProperties(
      location,
      ['locationEntityId', 'geographicNameId', 'coordinates', 'locationLabel'],
      `${path}.location`,
    );
    const coordinates =
      location.coordinates === null
        ? null
        : expectRecord(location.coordinates, `${path}.location.coordinates`);

    if (coordinates) {
      assertAllowedProperties(coordinates, ['x', 'y'], `${path}.location.coordinates`);
    }

    return {
      id: event.id,
      character_id: event.characterId,
      event_type: event.eventType,
      location_entity_id: location.locationEntityId,
      geographic_name_id: location.geographicNameId,
      x: coordinates?.x ?? null,
      y: coordinates?.y ?? null,
      location_label: location.locationLabel,
      summary: event.summary,
      language: event.language,
      observed_at: event.observedAt,
      related_sighting_id: event.relatedSightingId,
    };
  });

  return {
    categories,
    tags,
    players,
    entities,
    entityAliases,
    entityTags,
    dispositions,
    associations,
    characterLocationRelations,
    notes,
    noteTags,
    geographicNames,
    geographicAliases,
    locationEvents,
  };
}

function rethrowAsCacheError(error: unknown): never {
  if (error instanceof PublicDataRepositoryError) {
    throw new PublicDataRepositoryError(error.code, error.message, {
      source: 'cache',
      recoverable: error.recoverable,
      status: error.status,
      cause: error,
    });
  }

  throw new PublicDataRepositoryError(
    'invalid-response',
    'La caché pública Beta 0.2 no supera la validación estructural.',
    { source: 'cache', cause: error },
  );
}

export async function parsePublicCatalogSnapshotV2(
  value: unknown,
  now: () => number = Date.now,
): Promise<PublicCatalogEnvelope> {
  let record: Record<string, unknown>;

  try {
    record = expectRecord(value, 'snapshot');
    assertAllowedProperties(
      record,
      [
        'schemaVersion',
        'generatedAt',
        'sourceRevision',
        'checksum',
        'categories',
        'tags',
        'players',
        'entities',
        'dispositions',
        'associations',
        'characterLocationRelations',
        'notes',
        'geographicNames',
        'characterLocationEvents',
      ],
      'snapshot',
    );
  } catch (error) {
    rethrowAsCacheError(error);
  }

  if (record.schemaVersion !== 2) {
    throw new PublicDataRepositoryError(
      'unsupported-schema',
      'La caché pública no usa el contrato Beta 0.2.',
      { source: 'cache', recoverable: false },
    );
  }

  let generatedAt: string;
  let sourceRevision: string;
  let checksum: string;
  let content: PublicCatalogContentV2;

  try {
    generatedAt = expectString(record.generatedAt, 'snapshot.generatedAt');
    sourceRevision = expectChecksum(record.sourceRevision, 'snapshot.sourceRevision');
    checksum = expectChecksum(record.checksum, 'snapshot.checksum');
    const checksumContent = Object.fromEntries(
      [
        'schemaVersion',
        'categories',
        'tags',
        'players',
        'entities',
        'dispositions',
        'associations',
        'characterLocationRelations',
        'notes',
        'geographicNames',
        'characterLocationEvents',
      ]
        .filter((key) => Object.prototype.hasOwnProperty.call(record, key))
        .map((key) => [key, record[key]]),
    );
    const calculatedChecksum = await createSha256Checksum(checksumContent);
    if (checksum !== calculatedChecksum) {
      throw new PublicDataRepositoryError(
        'checksum-mismatch',
        'La caché pública no coincide con su checksum.',
        { source: 'cache' },
      );
    }
    content = buildPublicCatalogContentV2(snapshotPayloads(record));
  } catch (error) {
    rethrowAsCacheError(error);
  }

  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new PublicDataRepositoryError(
      'invalid-response',
      'snapshot.generatedAt no contiene una fecha válida.',
      { source: 'cache' },
    );
  }

  const snapshot: PublicCatalogSnapshotV2 = {
    ...content,
    generatedAt,
    sourceRevision,
    checksum,
  };

  return {
    data: { contract: 'beta02', catalog: snapshot },
    source: 'session-cache',
    metadata: {
      contract: 'beta02',
      schemaVersion: 2,
      generatedAt,
      loadedAt: new Date(now()).toISOString(),
      sourceRevision,
      checksum,
      stale: false,
    },
  };
}

export async function buildPublicCatalogEnvelopeV2(
  payloads: PublicCatalogTablePayloadsWithCharacterLocations,
  now: () => number = Date.now,
): Promise<PublicCatalogEnvelope> {
  const content = buildPublicCatalogContentV2(payloads);
  const generatedAt = new Date(now()).toISOString();
  const checksum = await createSha256Checksum(content);
  const snapshot: PublicCatalogSnapshotV2 = {
    ...content,
    generatedAt,
    sourceRevision: checksum,
    checksum,
  };

  return {
    data: { contract: 'beta02', catalog: snapshot },
    source: 'supabase',
    metadata: {
      contract: 'beta02',
      schemaVersion: 2,
      generatedAt,
      loadedAt: generatedAt,
      sourceRevision: checksum,
      checksum,
      stale: false,
    },
  };
}
