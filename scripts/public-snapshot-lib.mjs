import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const SNAPSHOT_PATH = 'public/data/public-catalog.snapshot.json';
export const FIXTURE_PATH = 'scripts/fixtures/beta01-public-rows.json';

const TABLE_QUERIES = {
  categories: {
    table: 'categories',
    select: 'id,slug,name,description',
    order: 'id.asc',
    published: true,
  },
  tags: {
    table: 'tags',
    select: 'id,name,description',
    order: 'id.asc',
    published: true,
  },
  players: {
    table: 'players',
    select: 'id,slug,display_name,name_language',
    order: 'id.asc',
    published: true,
  },
  entities: {
    table: 'map_entities',
    select: 'id,slug,entity_type,visibility,name,name_language,summary,description,x,y,category_id',
    order: 'id.asc',
    published: true,
  },
  entityAliases: {
    table: 'entity_aliases',
    select: 'id,entity_id,language,value',
    order: 'id.asc',
    published: true,
  },
  entityTags: {
    table: 'entity_tags',
    select: 'entity_id,tag_id',
    order: 'entity_id.asc,tag_id.asc',
    published: true,
  },
  dispositions: {
    table: 'entity_player_dispositions',
    select: 'entity_id,player_id,disposition',
    order: 'entity_id.asc,player_id.asc',
    published: false,
  },
  characterLocationRelations: {
    table: 'character_location_relations',
    select: 'character_id,location_id,relation_status',
    order: 'location_id.asc,character_id.asc',
    published: false,
  },
  notes: {
    table: 'public_notes',
    select: 'id,slug,entity_id,title,body,sort_order',
    order: 'entity_id.asc,sort_order.asc,id.asc',
    published: true,
  },
  noteTags: {
    table: 'public_note_tags',
    select: 'note_id,tag_id',
    order: 'note_id.asc,tag_id.asc',
    published: true,
  },
  geographicNames: {
    table: 'geographic_names',
    select: 'id,slug,name,language,x,y,recommended_zoom,entity_id',
    order: 'id.asc',
    published: true,
  },
  geographicAliases: {
    table: 'geographic_name_aliases',
    select: 'id,geographic_name_id,language,value',
    order: 'id.asc',
    published: true,
  },
  locationEvents: {
    table: 'character_location_events',
    select:
      'id,character_id,event_type,location_entity_id,geographic_name_id,x,y,location_label,summary,language,observed_at,related_sighting_id',
    order: 'id.asc',
    published: true,
  },
};

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
  const geographicNames = publicGeographicRows.map(
    ({ id, slug, name, language, x, y, recommended_zoom, entity_id }) => ({
      id,
      slug,
      name,
      language,
      aliases: (aliasesByGeographicName.get(id) ?? []).map(
        ({ id: aliasId, language: aliasLanguage, value }) => ({
          id: aliasId,
          geographicNameId: id,
          language: aliasLanguage,
          value,
        }),
      ),
      coordinates: { x, y },
      recommendedZoom: recommended_zoom,
      entityId: entity_id,
    }),
  );
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

async function fetchTable(projectUrl, publishableKey, query) {
  const result = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const url = new URL(`${projectUrl.replace(/\/$/, '')}/rest/v1/${query.table}`);
    url.searchParams.set('select', query.select);
    url.searchParams.set('order', query.order);
    if (query.published) url.searchParams.set('publication_status', 'eq.published');

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        apikey: publishableKey,
        Prefer: 'count=exact',
        Range: `${offset}-${offset + pageSize - 1}`,
        'Range-Unit': 'items',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`${query.table} returned ${response.status}: ${await response.text()}`);
    }

    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`${query.table} returned non-array JSON.`);
    result.push(...page);

    const contentRange = response.headers.get('content-range');
    const match = contentRange?.match(/^(?:\*|(\d+)-(\d+))\/(\d+)$/);
    if (!match) throw new Error(`${query.table} did not return a verifiable Content-Range.`);
    const total = Number(match[3]);
    offset += page.length;
    if (offset >= total) break;
    if (page.length === 0) throw new Error(`${query.table} pagination stopped before ${total}.`);
  }

  return result;
}

export async function loadRemotePublicRows() {
  const projectUrl = readRequiredEnv('VITE_SUPABASE_URL');
  const publishableKey = readRequiredEnv('VITE_SUPABASE_PUBLISHABLE_KEY');
  const entries = await Promise.all(
    Object.entries(TABLE_QUERIES).map(async ([key, query]) => [
      key,
      await fetchTable(projectUrl, publishableKey, query),
    ]),
  );
  return Object.fromEntries(entries);
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
