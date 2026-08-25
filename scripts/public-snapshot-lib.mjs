import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  fetchCompletePublicCatalogTable,
  INITIAL_PUBLIC_CAMPAIGN_ID,
  PUBLIC_CAMPAIGNS_QUERY,
  PUBLIC_CATALOG_TABLE_QUERIES,
  PublicCatalogReadError,
} from '../src/data-access/publicCatalogQueryContract.js';

export const SNAPSHOT_PATH = 'public/data/public-catalog.snapshot.json';
export const FIXTURE_PATH = 'scripts/fixtures/beta01-public-rows.json';
export const DEFAULT_REMOTE_READ_TIMEOUT_MS = 15_000;
export const INITIAL_PUBLIC_CAMPAIGN = Object.freeze({
  id: INITIAL_PUBLIC_CAMPAIGN_ID,
  slug: 'castigo-divino',
  name: 'Castigo Divino',
  status: 'active',
  displayOrder: 0,
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function record(value, key) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${key} must be an object.`);
  }
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
  const publicEntityRows = publishedRows(raw.entities ?? [], 'entities').filter(
    ({ category_id, audience }) =>
      (audience === undefined || audience === 'public') && categoryIds.has(category_id),
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
      ...(portrait_path == null ? {} : { portraitPath: portrait_path }),
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
    ({ entity_id }) => entity_id === null || entity_id === undefined || entityIds.has(entity_id),
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
    entityId: row.entity_id ?? null,
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

function campaignSnapshotRow(row, index) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`campaigns[${index}] must be an object.`);
  }
  if (typeof row.id !== 'string' || !UUID_PATTERN.test(row.id)) {
    throw new Error(`campaigns[${index}].id must be a stable UUID.`);
  }
  if (typeof row.slug !== 'string' || row.slug.trim().length === 0) {
    throw new Error(`campaigns[${index}].slug must be non-empty.`);
  }
  if (typeof row.name !== 'string' || row.name.trim().length === 0) {
    throw new Error(`campaigns[${index}].name must be non-empty.`);
  }
  if (row.status !== 'active') {
    throw new Error(`campaigns[${index}] is not publicly selectable.`);
  }
  if (!Number.isSafeInteger(row.display_order) || row.display_order < 0) {
    throw new Error(`campaigns[${index}].display_order must be a non-negative integer.`);
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: 'active',
    displayOrder: row.display_order,
  };
}

function publicGlobalGeographicNames(globalRows) {
  const content = buildPublicSnapshotContent({
    geographicNames: globalRows.geographicNames ?? [],
    geographicAliases: globalRows.geographicAliases ?? [],
  });

  return content.geographicNames.map(({ entityId, ...name }) => {
    if (entityId !== null) {
      throw new Error(
        `Global geographic name ${name.id} retained a campaign entity pointer after MAP-053.`,
      );
    }
    return name;
  });
}

function buildCampaignGeographicLinks(rawLinks, campaignId, entities, geographicNames) {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const geographicIds = new Set(geographicNames.map(({ id }) => id));
  const links = rows(rawLinks ?? [], `campaignsById.${campaignId}.geographicEntityLinks`).map(
    (link, index) => {
      if (
        link.campaign_id !== campaignId ||
        typeof link.geographic_name_id !== 'string' ||
        typeof link.entity_id !== 'string'
      ) {
        throw new Error(`campaign ${campaignId} geographic link ${index} has invalid scope.`);
      }
      if (!geographicIds.has(link.geographic_name_id)) {
        throw new Error(`campaign ${campaignId} links an unknown global geographic name.`);
      }
      const entity = entityById.get(link.entity_id);
      if (!entity || entity.entityType !== 'location') {
        throw new Error(
          `campaign ${campaignId} geographic link targets a non-public or non-location entity.`,
        );
      }
      return {
        campaignId,
        geographicNameId: link.geographic_name_id,
        entityId: link.entity_id,
      };
    },
  );

  requireUnique(
    links.map(({ geographicNameId }) => geographicNameId),
    `campaign ${campaignId} geographic links`,
  );
  return links;
}

export function buildPublicMulticampaignSnapshotContent(raw) {
  const input = record(raw, 'multicampaign rows');
  const campaigns = rows(input.campaigns ?? [], 'campaigns')
    .map(campaignSnapshotRow)
    .sort(
      (left, right) =>
        left.displayOrder - right.displayOrder || left.id.localeCompare(right.id),
    );

  if (campaigns.length === 0) {
    throw new Error('At least one active public campaign is required.');
  }
  requireUnique(
    campaigns.map(({ id }) => id),
    'campaigns',
  );
  requireUnique(
    campaigns.map(({ slug }) => slug),
    'campaign slugs',
  );

  const globalRows = record(input.global ?? {}, 'global');
  const campaignRowsById = record(input.campaignsById ?? {}, 'campaignsById');
  const geographicNames = publicGlobalGeographicNames(globalRows);
  const expectedGeographicJson = JSON.stringify(geographicNames);
  const campaignCatalogs = campaigns.map((campaign) => {
    const campaignRows = record(
      campaignRowsById[campaign.id],
      `campaignsById.${campaign.id}`,
    );
    const content = buildPublicSnapshotContent({
      ...campaignRows,
      geographicNames: globalRows.geographicNames ?? [],
      geographicAliases: globalRows.geographicAliases ?? [],
    });
    const projectedGlobal = content.geographicNames.map(({ entityId, ...name }) => {
      if (entityId !== null) {
        throw new Error(`campaign ${campaign.id} unexpectedly mutated the global geographic index.`);
      }
      return name;
    });

    if (JSON.stringify(projectedGlobal) !== expectedGeographicJson) {
      throw new Error(`campaign ${campaign.id} does not preserve the complete global geographic index.`);
    }

    return {
      campaignId: campaign.id,
      categories: content.categories,
      tags: content.tags,
      players: content.players,
      entities: content.entities,
      dispositions: content.dispositions,
      characterLocationRelations: content.characterLocationRelations,
      notes: content.notes,
      characterLocationEvents: content.characterLocationEvents,
      geographicEntityLinks: buildCampaignGeographicLinks(
        campaignRows.geographicEntityLinks ?? [],
        campaign.id,
        content.entities,
        geographicNames,
      ),
    };
  });

  const content = {
    schemaVersion: 3,
    campaigns,
    campaignCatalogs,
    geographicNames,
  };
  assertPublicMulticampaignSnapshotContent(content);
  return content;
}

export function upgradeLegacySnapshotContentV2(content) {
  const legacy = record(content, 'legacy snapshot content');
  if (legacy.schemaVersion !== 2) {
    throw new Error('Only schemaVersion 2 can be upgraded to the MAP-053 snapshot contract.');
  }

  const geographicNamesV2 = rows(legacy.geographicNames ?? [], 'geographicNames');
  const entities = rows(legacy.entities ?? [], 'entities');
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const geographicEntityLinks = geographicNamesV2
    .filter(({ entityId }) => entityId !== null && entityId !== undefined)
    .map(({ id, entityId }) => {
      const entity = entityById.get(entityId);
      if (!entity || entity.entityType !== 'location') {
        throw new Error(`Legacy geographic name ${id} points outside the public location catalog.`);
      }
      return {
        campaignId: INITIAL_PUBLIC_CAMPAIGN_ID,
        geographicNameId: id,
        entityId,
      };
    });
  const geographicNames = geographicNamesV2.map(({ entityId: _entityId, ...name }) => name);
  const upgraded = {
    schemaVersion: 3,
    campaigns: [INITIAL_PUBLIC_CAMPAIGN],
    campaignCatalogs: [
      {
        campaignId: INITIAL_PUBLIC_CAMPAIGN_ID,
        categories: rows(legacy.categories ?? [], 'categories'),
        tags: rows(legacy.tags ?? [], 'tags'),
        players: rows(legacy.players ?? [], 'players'),
        entities,
        dispositions: rows(legacy.dispositions ?? [], 'dispositions'),
        characterLocationRelations: rows(
          legacy.characterLocationRelations ?? [],
          'characterLocationRelations',
        ),
        notes: rows(legacy.notes ?? [], 'notes'),
        characterLocationEvents: rows(
          legacy.characterLocationEvents ?? [],
          'characterLocationEvents',
        ),
        geographicEntityLinks,
      },
    ],
    geographicNames,
  };
  assertPublicMulticampaignSnapshotContent(upgraded);
  return upgraded;
}

function projectCampaignCatalogToV2(content, campaignId) {
  const catalog = rows(content.campaignCatalogs ?? [], 'campaignCatalogs').find(
    (candidate) => candidate.campaignId === campaignId,
  );
  if (!catalog) throw new Error(`Snapshot does not contain campaign ${campaignId}.`);

  const links = rows(catalog.geographicEntityLinks ?? [], 'geographicEntityLinks');
  const entityByGeographicName = new Map();
  for (const link of links) {
    if (link.campaignId !== campaignId) {
      throw new Error(`Snapshot geographic link escapes campaign ${campaignId}.`);
    }
    if (entityByGeographicName.has(link.geographicNameId)) {
      throw new Error(`Snapshot contains duplicate geographic link in campaign ${campaignId}.`);
    }
    entityByGeographicName.set(link.geographicNameId, link.entityId);
  }

  return {
    schemaVersion: 2,
    categories: rows(catalog.categories ?? [], 'categories'),
    tags: rows(catalog.tags ?? [], 'tags'),
    players: rows(catalog.players ?? [], 'players'),
    entities: rows(catalog.entities ?? [], 'entities'),
    dispositions: rows(catalog.dispositions ?? [], 'dispositions'),
    characterLocationRelations: rows(
      catalog.characterLocationRelations ?? [],
      'characterLocationRelations',
    ),
    notes: rows(catalog.notes ?? [], 'notes'),
    geographicNames: rows(content.geographicNames ?? [], 'geographicNames').map((name) => ({
      ...name,
      entityId: entityByGeographicName.get(name.id) ?? null,
    })),
    characterLocationEvents: rows(
      catalog.characterLocationEvents ?? [],
      'characterLocationEvents',
    ),
  };
}

export function projectMulticampaignSnapshotContentToV2(
  content,
  campaignId = INITIAL_PUBLIC_CAMPAIGN_ID,
) {
  assertPublicMulticampaignSnapshotContent(content);
  return projectCampaignCatalogToV2(content, campaignId);
}

export function assertPublicMulticampaignSnapshotContent(content) {
  const snapshot = record(content, 'multicampaign snapshot content');
  if (snapshot.schemaVersion !== 3) throw new Error('Multicampaign snapshot must use schemaVersion 3.');

  const campaigns = rows(snapshot.campaigns ?? [], 'campaigns');
  const catalogs = rows(snapshot.campaignCatalogs ?? [], 'campaignCatalogs');
  const geographicNames = rows(snapshot.geographicNames ?? [], 'geographicNames');
  if (campaigns.length === 0 || catalogs.length !== campaigns.length) {
    throw new Error('Every public campaign must have exactly one snapshot catalog.');
  }
  requireUnique(
    campaigns.map(({ id }) => id),
    'campaigns',
  );
  requireUnique(
    campaigns.map(({ slug }) => slug),
    'campaign slugs',
  );
  requireUnique(
    catalogs.map(({ campaignId }) => campaignId),
    'campaign catalogs',
  );
  requireUnique(
    geographicNames.map(({ id }) => id),
    'global geographic names',
  );

  const campaignIds = new Set(campaigns.map(({ id }) => id));
  const geographicIds = new Set(geographicNames.map(({ id }) => id));
  for (const [index, campaign] of campaigns.entries()) {
    if (
      typeof campaign.id !== 'string' ||
      !UUID_PATTERN.test(campaign.id) ||
      typeof campaign.slug !== 'string' ||
      typeof campaign.name !== 'string' ||
      campaign.status !== 'active' ||
      !Number.isSafeInteger(campaign.displayOrder) ||
      campaign.displayOrder < 0
    ) {
      throw new Error(`campaigns[${index}] is invalid.`);
    }
  }
  for (const [index, name] of geographicNames.entries()) {
    if (Object.prototype.hasOwnProperty.call(name, 'entityId')) {
      throw new Error(`geographicNames[${index}] contains campaign-specific entityId.`);
    }
  }
  for (const catalog of catalogs) {
    if (!campaignIds.has(catalog.campaignId)) {
      throw new Error(`Catalog ${catalog.campaignId} does not match a public campaign.`);
    }
    const entities = rows(catalog.entities ?? [], `catalog ${catalog.campaignId} entities`);
    const entityById = new Map(entities.map((entity) => [entity.id, entity]));
    const links = rows(
      catalog.geographicEntityLinks ?? [],
      `catalog ${catalog.campaignId} geographic links`,
    );
    requireUnique(
      links.map(({ geographicNameId }) => geographicNameId),
      `catalog ${catalog.campaignId} geographic links`,
    );
    for (const link of links) {
      if (link.campaignId !== catalog.campaignId || !geographicIds.has(link.geographicNameId)) {
        throw new Error(`Catalog ${catalog.campaignId} contains an invalid geographic link.`);
      }
      const entity = entityById.get(link.entityId);
      if (!entity || entity.entityType !== 'location') {
        throw new Error(`Catalog ${catalog.campaignId} links geography to a non-public location.`);
      }
    }
    projectCampaignCatalogToV2(snapshot, catalog.campaignId);
  }
}

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function remoteOptions(options) {
  return {
    projectUrl: options.projectUrl ?? readRequiredEnv('VITE_SUPABASE_URL'),
    publishableKey:
      options.publishableKey ?? readRequiredEnv('VITE_SUPABASE_PUBLISHABLE_KEY'),
    fetchImplementation: options.fetchImplementation ?? globalThis.fetch.bind(globalThis),
    timeoutMs: options.timeoutMs ?? DEFAULT_REMOTE_READ_TIMEOUT_MS,
  };
}

function snapshotQuery(query) {
  if (query.name !== 'map_entities') return query;
  return {
    ...query,
    select: query.select.replace('visibility,', 'visibility,audience,'),
  };
}

async function withRemoteController(options, operation) {
  const resolved = remoteOptions(options);
  const controller = new AbortController();
  const handleParentAbort = () => controller.abort();

  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener('abort', handleParentAbort, { once: true });
  }

  const timeout = globalThis.setTimeout(() => controller.abort(), resolved.timeoutMs);

  try {
    return await operation({ ...resolved, signal: controller.signal });
  } catch (error) {
    controller.abort();

    if (
      error instanceof PublicCatalogReadError &&
      error.kind === 'request-aborted' &&
      !options.signal?.aborted
    ) {
      throw new Error(`Remote public catalog read timed out after ${resolved.timeoutMs} ms.`, {
        cause: error,
      });
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    options.signal?.removeEventListener('abort', handleParentAbort);
  }
}

async function loadQuerySet(queries, resolved, campaignId) {
  const entries = await Promise.all(
    queries.map(async ([key, query]) => [
      key,
      await fetchCompletePublicCatalogTable({
        projectUrl: resolved.projectUrl,
        publishableKey: resolved.publishableKey,
        query: snapshotQuery(query),
        campaignId,
        fetchImplementation: resolved.fetchImplementation,
        signal: resolved.signal,
      }),
    ]),
  );
  return Object.fromEntries(entries);
}

export async function loadRemotePublicRows(options = {}) {
  return await withRemoteController(options, async (resolved) =>
    loadQuerySet(Object.entries(PUBLIC_CATALOG_TABLE_QUERIES), resolved, options.campaignId),
  );
}

export async function loadRemotePublicMulticampaignRows(options = {}) {
  return await withRemoteController(options, async (resolved) => {
    const campaigns = await fetchCompletePublicCatalogTable({
      projectUrl: resolved.projectUrl,
      publishableKey: resolved.publishableKey,
      query: PUBLIC_CAMPAIGNS_QUERY,
      fetchImplementation: resolved.fetchImplementation,
      signal: resolved.signal,
    });
    const globalQueries = Object.entries(PUBLIC_CATALOG_TABLE_QUERIES).filter(
      ([, query]) => !query.campaignScoped,
    );
    const campaignQueries = Object.entries(PUBLIC_CATALOG_TABLE_QUERIES).filter(
      ([, query]) => query.campaignScoped,
    );
    const global = await loadQuerySet(globalQueries, resolved);
    const campaignsById = Object.fromEntries(
      await Promise.all(
        campaigns.map(async (campaign, index) => {
          if (typeof campaign.id !== 'string' || !UUID_PATTERN.test(campaign.id)) {
            throw new Error(`campaigns[${index}].id must be a stable UUID.`);
          }
          return [campaign.id, await loadQuerySet(campaignQueries, resolved, campaign.id)];
        }),
      ),
    );

    return { campaigns, global, campaignsById };
  });
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
