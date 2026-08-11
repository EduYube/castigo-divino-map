import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  fetchCompletePublicCatalogTable,
  PUBLIC_CATALOG_TABLE_QUERIES,
  PublicCatalogReadError,
} from '../src/data-access/publicCatalogQueryContract.js';

export const SNAPSHOT_PATH = 'public/data/public-catalog.snapshot.json';
export const FIXTURE_PATH = 'scripts/fixtures/beta01-public-rows.json';
export const DEFAULT_REMOTE_READ_TIMEOUT_MS = 15_000;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function serializeCanonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function checksum(value) {
  return `sha256:${createHash('sha256').update(serializeCanonicalJson(value)).digest('hex')}`;
}

function rows(value, key) {
  if (!Array.isArray(value)) throw new Error(`${key} must be an array.`);
  return value;
}

function publishedRows(value, key) {
  return rows(value, key).filter(
    (row) => row.publication_status === undefined || row.publication_status === 'published',
  );
}

function group(values, keyOf) {
  const grouped = new Map();
  for (const value of values) {
    const key = keyOf(value);
    const bucket = grouped.get(key) ?? [];
    bucket.push(value);
    grouped.set(key, bucket);
  }
  return grouped;
}

function requireUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${label} contains duplicate identity ${value}.`);
    seen.add(value);
  }
}

function geographicSearchExtent(row) {
  const values = [row.search_min_x, row.search_max_x, row.search_min_y, row.search_max_y];
  if (values.every((value) => value === null || value === undefined)) return null;
  if (values.some((value) => value === null || value === undefined)) {
    throw new Error(`geographicNames.${row.id}.searchExtent must provide all four bounds or none.`);
  }

  const [minX, maxX, minY, maxY] = values;
  if (
    !values.every(Number.isFinite) ||
    minX < 0 ||
    maxX > 3600 ||
    minY < 0 ||
    maxY > 2329 ||
    minX >= maxX ||
    minY >= maxY
  ) {
    throw new Error(
      `geographicNames.${row.id}.searchExtent is outside the MAP-041 bounds contract.`,
    );
  }
  if (row.x < minX || row.x > maxX || row.y < minY || row.y > maxY) {
    throw new Error(`geographicNames.${row.id}.searchExtent does not contain its canonical point.`);
  }

  return { minX, maxX, minY, maxY };
}

export function buildPublicSnapshotContent(raw) {
  const categories = publishedRows(raw.categories ?? [], 'categories').map(
    ({ id, slug, name, description }) => ({ id, slug, name, description }),
  );
  const tags = publishedRows(raw.tags ?? [], 'tags').map(({ id, name, description }) => ({
    id,
    name,
    description,
  }));
  const players = publishedRows(raw.players ?? [], 'players').map(
    ({ id, slug, display_name, name_language }) => ({
      id,
      slug,
      displayName: display_name,
      nameLanguage: name_language,
    }),
  );
  const categoryIds = new Set(categories.map(({ id }) => id));
  const tagIds = new Set(tags.map(({ id }) => id));
  const playerIds = new Set(players.map(({ id }) => id));
  const publicEntityRows = publishedRows(raw.entities ?? [], 'entities').filter(({ category_id }) =>
    categoryIds.has(category_id),
  );
  const entityIds = new Set(publicEntityRows.map(({ id }) => id));
  const aliasRows = publishedRows(raw.entityAliases ?? [], 'entityAliases').filter(
    ({ entity_id }) => entityIds.has(entity_id),
  );
  const entityTagRows = publishedRows(raw.entityTags ?? [], 'entityTags').filter(
    ({ entity_id, tag_id }) => entityIds.has(entity_id) && tagIds.has(tag_id),
  );
  const aliasesByEntity = group(aliasRows, ({ entity_id }) => entity_id);
  const tagsByEntity = group(entityTagRows, ({ entity_id }) => entity_id);
  const entities = publicEntityRows.map(
    ({
      id,
      slug,
      entity_type,
      visibility,
      name,
      name_language,
      summary,
      description,
      portrait_path,
      x,
      y,
      category_id,
    }) => ({
      id,
      slug,
      entityType: entity_type,
      visibility,
      name,
      nameLanguage: name_language,
      aliases: (aliasesByEntity.get(id) ?? []).map(({ id: aliasId, language, value }) => ({
        id: aliasId,
        entityId: id,
        language,
        value,
      })),
      summary,
      description,
      portraitPath: portrait_path ?? null,
      coordinates: { x, y },
      categoryId: category_id,
      tagIds: (tagsByEntity.get(id) ?? []).map(({ tag_id }) => tag_id),
    }),
  );
  const dispositions = rows(raw.dispositions ?? [], 'dispositions')
    .filter(({ entity_id, player_id }) => entityIds.has(entity_id) && playerIds.has(player_id))
    .map(({ entity_id, player_id, disposition }) => ({
      entityId: entity_id,
      playerId: player_id,
      disposition,
    }));
  const characterLocationRelations = publishedRows(
    raw.characterLocationRelations ?? [],
    'characterLocationRelations',
  )
    .filter(
      ({ character_id, location_id }) => entityIds.has(character_id) && entityIds.has(location_id),
    )
    .map(({ character_id, location_id, relation_status }) => ({
      characterId: character_id,
      locationId: location_id,
      relationStatus: relation_status,
    }));
  const publicNoteRows = publishedRows(raw.notes ?? [], 'notes').filter(({ entity_id }) =>
    entityIds.has(entity_id),
  );
  const noteIds = new Set(publicNoteRows.map(({ id }) => id));
  const noteTagRows = publishedRows(raw.noteTags ?? [], 'noteTags').filter(
    ({ note_id, tag_id }) => noteIds.has(note_id) && tagIds.has(tag_id),
  );
  const tagsByNote = group(noteTagRows, ({ note_id }) => note_id);
  const notes = publicNoteRows.map(({ id, slug, entity_id, title, body, sort_order }) => ({
    id,
    slug,
    entityId: entity_id,
    title,
    body,
    sortOrder: sort_order,
    tagIds: (tagsByNote.get(id) ?? []).map(({ tag_id }) => tag_id),
  }));
  const publicGeographicRows = publishedRows(raw.geographicNames ?? [], 'geographicNames').filter(
    ({ entity_id }) => entity_id === null || entityIds.has(entity_id),
  );
  const geographicIds = new Set(publicGeographicRows.map(({ id }) => id));
  const geographicAliasRows = publishedRows(
    raw.geographicAliases ?? [],
    'geographicAliases',
  ).filter(({ geographic_name_id }) => geographicIds.has(geographic_name_id));
  const aliasesByGeographicName = group(
    geographicAliasRows,
    ({ geographic_name_id }) => geographic_name_id,
  );
  const geographicNames = publicGeographicRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    language: row.language,
    aliases: (aliasesByGeographicName.get(row.id) ?? []).map(
      ({ id: aliasId, language: aliasLanguage, value }) => ({
        id: aliasId,
        geographicNameId: row.id,
        language: aliasLanguage,
        value,
      }),
    ),
    coordinates: { x: row.x, y: row.y },
    searchExtent: geographicSearchExtent(row),
    recommendedZoom: row.recommended_zoom,
    entityId: row.entity_id,
  }));
  const locationEvents = publishedRows(raw.locationEvents ?? [], 'locationEvents')
    .filter(
      ({ character_id, location_entity_id, geographic_name_id }) =>
        entityIds.has(character_id) &&
        (location_entity_id === null || entityIds.has(location_entity_id)) &&
        (geographic_name_id === null || geographicIds.has(geographic_name_id)),
    )
    .map(
      ({
        id,
        character_id,
        event_type,
        location_entity_id,
        geographic_name_id,
        x,
        y,
        location_label,
        summary,
        language,
        observed_at,
        related_sighting_id,
      }) => ({
        id,
        characterId: character_id,
        eventType: event_type,
        location: {
          locationEntityId: location_entity_id,
          geographicNameId: geographic_name_id,
          coordinates: x === null || y === null ? null : { x, y },
          locationLabel: location_label,
        },
        summary,
        language,
        observedAt: observed_at,
        relatedSightingId: related_sighting_id,
      }),
    );

  requireUnique(
    categories.map(({ id }) => id),
    'categories',
  );
  requireUnique(
    tags.map(({ id }) => id),
    'tags',
  );
  requireUnique(
    players.map(({ id }) => id),
    'players',
  );
  requireUnique(
    entities.map(({ id }) => id),
    'entities',
  );
  requireUnique(
    notes.map(({ id }) => id),
    'notes',
  );
  requireUnique(
    geographicNames.map(({ id }) => id),
    'geographicNames',
  );
  requireUnique(
    locationEvents.map(({ id }) => id),
    'characterLocationEvents',
  );

  return {
    schemaVersion: 2,
    categories,
    tags,
    players,
    entities,
    dispositions,
    characterLocationRelations,
    notes,
    geographicNames,
    characterLocationEvents: locationEvents,
  };
}

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export async function loadRemotePublicRows(options = {}) {
  const projectUrl = options.projectUrl ?? readRequiredEnv('VITE_SUPABASE_URL');
  const publishableKey = options.publishableKey ?? readRequiredEnv('VITE_SUPABASE_PUBLISHABLE_KEY');
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DEFAULT_REMOTE_READ_TIMEOUT_MS;
  const controller = new AbortController();
  const handleParentAbort = () => controller.abort();

  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener('abort', handleParentAbort, { once: true });
  }

  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const entries = await Promise.all(
      Object.entries(PUBLIC_CATALOG_TABLE_QUERIES).map(async ([key, query]) => [
        key,
        await fetchCompletePublicCatalogTable({
          projectUrl,
          publishableKey,
          query,
          fetchImplementation,
          signal: controller.signal,
        }),
      ]),
    );

    return Object.fromEntries(entries);
  } catch (error) {
    controller.abort();

    if (
      error instanceof PublicCatalogReadError &&
      error.kind === 'request-aborted' &&
      !options.signal?.aborted
    ) {
      throw new Error(`Remote public catalog read timed out after ${timeoutMs} ms.`, {
        cause: error,
      });
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    options.signal?.removeEventListener('abort', handleParentAbort);
  }
}

export async function loadFixtureRows(path = FIXTURE_PATH) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function toSnapshot(content, generatedAt) {
  const contentChecksum = checksum(content);
  return {
    ...content,
    generatedAt,
    sourceRevision: contentChecksum,
    checksum: contentChecksum,
  };
}

export function snapshotContent(snapshot) {
  const content = { ...snapshot };
  delete content.generatedAt;
  delete content.sourceRevision;
  delete content.checksum;
  return content;
}
