import type { PublicCatalogSnapshotV2 } from '../../data/beta02-model';
import {
  PublicDataRepositoryError,
  createSha256Checksum,
  type PublicCatalogEnvelope,
} from '../../data-access/publicCatalog';
import {
  groupValues,
  parseCategory,
  parseDisposition,
  parseEntity,
  parseEntityAlias,
  parseEntityTag,
  parseGeographicAlias,
  parseGeographicName,
  parseLocationEvent,
  parseNote,
  parseNoteTag,
  parsePlayer,
  parseTag,
  type PublicCatalogTablePayloads,
} from './publicCatalogRows';

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

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalidResponse(`${path} debe ser texto no vacío.`);
  }

  return value;
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

function assertReferences(snapshot: PublicCatalogSnapshotV2): void {
  const categoryIds = new Set(snapshot.categories.map(({ id }) => id));
  const tagIds = new Set(snapshot.tags.map(({ id }) => id));
  const playerIds = new Set(snapshot.players.map(({ id }) => id));
  const entityIds = new Set(snapshot.entities.map(({ id }) => id));
  const noteIds = new Set(snapshot.notes.map(({ id }) => id));
  const geographicNameIds = new Set(snapshot.geographicNames.map(({ id }) => id));
  const eventIds = new Set(snapshot.characterLocationEvents.map(({ id }) => id));

  assertUnique([...categoryIds], 'categories');
  assertUnique([...tagIds], 'tags');
  assertUnique([...playerIds], 'players');
  assertUnique([...entityIds], 'entities');
  assertUnique([...noteIds], 'notes');
  assertUnique([...geographicNameIds], 'geographicNames');
  assertUnique([...eventIds], 'characterLocationEvents');

  snapshot.entities.forEach((entity) => {
    if (!categoryIds.has(entity.categoryId)) {
      invalidResponse(`La entidad “${entity.id}” referencia una categoría ausente.`);
    }
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
    if (!entityIds.has(disposition.entityId) || !playerIds.has(disposition.playerId)) {
      invalidResponse('Una disposición pública referencia un extremo ausente.');
    }
  });

  snapshot.notes.forEach((note) => {
    if (!entityIds.has(note.entityId)) {
      invalidResponse(`La nota “${note.id}” referencia una entidad ausente.`);
    }
    note.tagIds.forEach((tagId) => {
      if (!tagIds.has(tagId)) {
        invalidResponse(`La nota “${note.id}” referencia una etiqueta ausente.`);
      }
    });
  });

  snapshot.geographicNames.forEach((name) => {
    if (name.entityId !== null && !entityIds.has(name.entityId)) {
      invalidResponse(`El nombre geográfico “${name.id}” referencia una entidad ausente.`);
    }
    name.aliases.forEach((alias) => {
      if (alias.geographicNameId !== name.id) {
        invalidResponse(`El alias geográfico “${alias.id}” no coincide con su contenedor.`);
      }
    });
  });

  snapshot.characterLocationEvents.forEach((event) => {
    if (!entityIds.has(event.characterId)) {
      invalidResponse(`El acontecimiento “${event.id}” referencia un personaje ausente.`);
    }
    if (
      event.location.locationEntityId !== null &&
      !entityIds.has(event.location.locationEntityId)
    ) {
      invalidResponse(`El acontecimiento “${event.id}” referencia una ubicación ausente.`);
    }
    if (
      event.location.geographicNameId !== null &&
      !geographicNameIds.has(event.location.geographicNameId)
    ) {
      invalidResponse(`El acontecimiento “${event.id}” referencia un nombre geográfico ausente.`);
    }
    if (event.relatedSightingId !== null && !eventIds.has(event.relatedSightingId)) {
      invalidResponse(`El acontecimiento “${event.id}” referencia un avistamiento ausente.`);
    }
  });
}

function snapshotContent(
  snapshot: PublicCatalogSnapshotV2,
): Omit<PublicCatalogSnapshotV2, 'generatedAt' | 'sourceRevision' | 'checksum'> {
  return {
    schemaVersion: 2,
    categories: snapshot.categories,
    tags: snapshot.tags,
    players: snapshot.players,
    entities: snapshot.entities,
    dispositions: snapshot.dispositions,
    notes: snapshot.notes,
    geographicNames: snapshot.geographicNames,
    characterLocationEvents: snapshot.characterLocationEvents,
  };
}

export async function parsePublicCatalogSnapshotV2(
  value: unknown,
  now: () => number = Date.now,
): Promise<PublicCatalogEnvelope> {
  const record = expectRecord(value, 'snapshot');
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
      'notes',
      'geographicNames',
      'characterLocationEvents',
    ],
    'snapshot',
  );

  if (record.schemaVersion !== 2) {
    throw new PublicDataRepositoryError(
      'unsupported-schema',
      'La caché pública no usa el contrato Beta 0.2.',
      { source: 'cache', recoverable: false },
    );
  }

  const generatedAt = expectString(record.generatedAt, 'snapshot.generatedAt');
  const generatedAtMs = Date.parse(generatedAt);

  if (!Number.isFinite(generatedAtMs)) {
    invalidResponse('snapshot.generatedAt no contiene una fecha válida.');
  }

  const snapshot = record as unknown as PublicCatalogSnapshotV2;
  assertReferences(snapshot);
  const calculatedChecksum = await createSha256Checksum(snapshotContent(snapshot));

  if (snapshot.checksum !== calculatedChecksum) {
    throw new PublicDataRepositoryError(
      'checksum-mismatch',
      'La caché pública no coincide con su checksum.',
      { source: 'cache' },
    );
  }

  return {
    data: { contract: 'beta02', catalog: snapshot },
    source: 'session-cache',
    metadata: {
      contract: 'beta02',
      schemaVersion: 2,
      generatedAt,
      loadedAt: new Date(now()).toISOString(),
      sourceRevision: expectString(record.sourceRevision, 'snapshot.sourceRevision'),
      checksum: expectString(record.checksum, 'snapshot.checksum'),
      stale: false,
    },
  };
}

export async function buildPublicCatalogEnvelopeV2(
  payloads: PublicCatalogTablePayloads,
  now: () => number = Date.now,
): Promise<PublicCatalogEnvelope> {
  const categories = payloads.categories.map(parseCategory);
  const tags = payloads.tags.map(parseTag);
  const players = payloads.players.map(parsePlayer);
  const entityAliases = payloads.entityAliases.map(parseEntityAlias);
  const entityTags = payloads.entityTags.map(parseEntityTag);
  const dispositions = payloads.dispositions.map(parseDisposition);
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
    parseGeographicName(row, index, aliasesByName),
  );
  const characterLocationEvents = payloads.locationEvents.map(parseLocationEvent);
  const generatedAt = new Date(now()).toISOString();
  const content = {
    schemaVersion: 2 as const,
    categories,
    tags,
    players,
    entities,
    dispositions,
    notes,
    geographicNames,
    characterLocationEvents,
  };
  const checksum = await createSha256Checksum(content);
  const snapshot: PublicCatalogSnapshotV2 = {
    ...content,
    generatedAt,
    sourceRevision: checksum,
    checksum,
  };

  assertReferences(snapshot);

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
