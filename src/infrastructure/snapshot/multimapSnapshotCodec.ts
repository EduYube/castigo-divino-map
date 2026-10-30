import type { PublicCatalogSnapshotV2 } from '../../data/beta02-model';
import type { PublicCatalogSnapshotV3 } from '../../data/beta03-model';
import type {
  PublicCatalogSnapshotV4,
  PublicCampaignLocalMapV4,
  PublicMapContextV4,
} from '../../data/beta04-model';
import {
  PublicDataRepositoryError,
  createSha256Checksum,
  type PublicCatalogEnvelope,
} from '../../data-access/publicCatalog';
import {
  parsePublicCatalogSnapshotV3,
  projectPublicCatalogSnapshotV3ToV2,
} from './multicampaignSnapshotCodec';
import {
  mergePublicLocalCatalog,
  parsePublicLocalPlacement,
  type PublicLocalMapData,
} from '../supabase/publicLocalMapRepository';

const CHECKSUM = /^sha256:[0-9a-f]{64}$/;
const MAP_ID = /^map-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GEO_ID = /^geo-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function invalid(message: string): never {
  throw new PublicDataRepositoryError('invalid-snapshot', 'Snapshot V4: ' + message, {
    source: 'snapshot',
    recoverable: false,
  });
}
function obj(value: unknown, path: string, props: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid(path + ' must be an object.');
  const row = value as Record<string, unknown>;
  const excess = Object.keys(row).find((key) => !props.includes(key));
  if (excess) invalid(path + ' has unexpected field ' + excess);
  for (const required of props)
    if (!Object.hasOwn(row, required)) invalid(path + ' lacks ' + required);
  return row;
}
function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(path + ' must be an array.');
  return value as readonly unknown[];
}
function uniq(keys: readonly string[], path: string): void {
  if (new Set(keys).size !== keys.length) invalid(path + ' contains duplicates.');
}
function nonempty(value: unknown, path: string, re?: RegExp): string {
  if (typeof value !== 'string' || !value.trim() || (re && !re.test(value)))
    invalid(path + ' is not public text.');
  return value as string;
}
function id(value: unknown, path: string, re: RegExp): string {
  return nonempty(value, path, re);
}
function dimension(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    invalid(path + ' is not a positive integer.');
  return value as number;
}
const TOP = [
  'schemaVersion',
  'generatedAt',
  'sourceRevision',
  'checksum',
  'campaigns',
  'campaignCatalogs',
  'geographicNames',
  'mapContexts',
  'campaignLocalMaps',
] as const;
const LOCAL = [
  'campaignId',
  'contexts',
  'geographicMapContextLinks',
  'placements',
  'localOnlyEntities',
  'notes',
  'dispositions',
  'associations',
  'entityRelations',
  'characterLocationRelations',
] as const;
const ENTITY_KEYS = [
  'id',
  'slug',
  'entityType',
  'lifecycleStatus',
  'visibility',
  'name',
  'nameLanguage',
  'summary',
  'description',
  'portraitPath',
  'categoryId',
  'aliases',
  'tagIds',
  'coordinates',
  'geometry',
] as const;
function parseContext(value: unknown, index: number): PublicMapContextV4 {
  const row = obj(value, 'mapContexts[' + index + ']', [
    'id',
    'slug',
    'name',
    'parentId',
    'width',
    'height',
    'imageUri',
  ]);
  const parent = row.parentId;
  const uri = row.imageUri;
  if (
    !(parent === null || (typeof parent === 'string' && MAP_ID.test(parent))) ||
    !(uri === null || (typeof uri === 'string' && /^https:\/\//.test(uri)))
  )
    invalid('mapContexts[' + index + '] has invalid parent or image URI.');
  return {
    id: id(row.id, 'context.id', MAP_ID),
    slug: id(row.slug, 'context.slug', SLUG),
    name: nonempty(row.name, 'context.name'),
    parentId: parent as string | null,
    width: dimension(row.width, 'context.width'),
    height: dimension(row.height, 'context.height'),
    imageUri: uri as string | null,
  };
}
function parseLocal(
  value: unknown,
  index: number,
  campaignIdSet: ReadonlySet<string>,
  geographicIds: ReadonlySet<string>,
  contexts: ReadonlyMap<string, PublicMapContextV4>,
  world: PublicCatalogSnapshotV2,
): PublicCampaignLocalMapV4 {
  const row = obj(value, 'campaignLocalMaps[' + index + ']', LOCAL);
  const campaignId = nonempty(row.campaignId, 'local.campaignId');
  if (!campaignIdSet.has(campaignId)) invalid('local map for inactive campaign.');
  const linked = array(row.geographicMapContextLinks, 'local.geographicMapContextLinks').map(
    (link, i) => {
      const r = obj(link, 'local.link[' + i + ']', ['campaignId', 'geographicNameId', 'contextId']);
      if (
        r.campaignId !== campaignId ||
        !geographicIds.has(id(r.geographicNameId, 'link.geographicNameId', GEO_ID)) ||
        !contexts.has(id(r.contextId, 'link.contextId', MAP_ID))
      )
        invalid('local link is cross-campaign, unpublished or invalid.');
      return {
        campaignId,
        geographicNameId: r.geographicNameId as string,
        contextId: r.contextId as string,
      };
    },
  );
  uniq(
    linked.map(({ geographicNameId }) => geographicNameId),
    'local geographic links',
  );
  const contextIds = new Set(linked.map(({ contextId }) => contextId));
  const localContexts = array(row.contexts, 'local.contexts').map((context, i) => {
    const c = obj(context, 'local.contexts[' + i + ']', ['id', 'slug', 'name', 'width', 'height']);
    const global = contexts.get(id(c.id, 'local.context.id', MAP_ID));
    if (
      !global ||
      !contextIds.has(global.id) ||
      c.slug !== global.slug ||
      c.name !== global.name ||
      c.width !== global.width ||
      c.height !== global.height
    )
      invalid('local context is unbound or differs from its published global metadata.');
    return {
      id: global.id,
      slug: global.slug,
      name: global.name,
      width: global.width,
      height: global.height,
    };
  });
  uniq(
    localContexts.map(({ id }) => id),
    'local contexts',
  );
  if (new Set(localContexts.map(({ id }) => id)).size !== contextIds.size)
    invalid('local map bindings have missing contexts.');
  const placements = array(row.placements, 'local.placements').map((value, i) => {
    const p = obj(value, 'local.placements[' + i + ']', [
      'contextId',
      'entityId',
      'geometry',
      'coordinates',
    ]);
    // The published PostgREST row and V4 representation must have identical
    // geometry/bounds semantics; reuse MAP-079's canonical local parser.
    const parsed = parsePublicLocalPlacement(
      {
        campaign_id: campaignId,
        map_context_id: p.contextId,
        entity_id: p.entityId,
        geometry: p.geometry,
        x: (p.coordinates as Record<string, unknown>)?.x,
        y: (p.coordinates as Record<string, unknown>)?.y,
        publication_status: 'published',
      },
      campaignId,
      localContexts,
    );
    if (
      JSON.stringify(p.geometry) !== JSON.stringify(parsed.geometry) ||
      JSON.stringify(p.coordinates) !== JSON.stringify(parsed.coordinates)
    )
      invalid('non-canonical local placement geometry.');
    return parsed;
  });
  uniq(
    placements.map((p) => p.contextId + '\u0000' + p.entityId),
    'local placements',
  );
  const worldIds = new Set(world.entities.map(({ id }) => id));
  const localEntities = array(row.localOnlyEntities, 'local.localOnlyEntities').map((value, i) => {
    const raw = value as Record<string, unknown>;
    const e = obj(
      value,
      'localOnlyEntities[' + i + ']',
      ENTITY_KEYS.filter((k) => typeof raw === 'object' && raw !== null && Object.hasOwn(raw, k)),
    );
    if (worldIds.has(e.id as string)) invalid('local-only entity duplicated in world catalog.');
    if (!placements.some((p) => p.entityId === e.id))
      invalid('local-only entity without public placement.');
    if (!world.categories.some(({ id }) => id === e.categoryId))
      invalid('local-only unpublished category.');
    if (!['character', 'location', 'mission', 'hazard'].includes(String(e.entityType)))
      invalid('local-only organization or unknown entity type.');
    const placement = placements.find((p) => p.entityId === e.id);
    const coord = e.coordinates as Record<string, unknown> | undefined;
    if (
      !placement ||
      !coord ||
      Object.keys(coord).some((k) => !['x', 'y'].includes(k)) ||
      coord.x !== placement.coordinates.x ||
      coord.y !== placement.coordinates.y
    )
      invalid('local-only coordinates must derive from an authorized placement.');
    nonempty(e.id, 'local entity.id', /^(?:entity|place)-[a-z0-9]+(?:-[a-z0-9]+)*$/);
    nonempty(e.slug, 'local entity.slug', SLUG);
    nonempty(e.name, 'local entity.name');
    if (
      e.nameLanguage !== 'en' ||
      !['pin', 'search_only'].includes(String(e.visibility)) ||
      typeof e.summary !== 'string' ||
      typeof e.description !== 'string'
    )
      invalid('invalid local-only public entity metadata.');
    const aliases = array(e.aliases, 'local entity.aliases');
    uniq(
      aliases.map((alias, i) => {
        const a = obj(alias, 'local.alias[' + i + ']', ['id', 'entityId', 'language', 'value']);
        if (a.entityId !== e.id) invalid('cross-entity alias.');
        return nonempty(a.id, 'alias id');
      }),
      'entity aliases',
    );
    const tagIds = array(e.tagIds, 'local entity.tagIds').map((t) => nonempty(t, 'tag ID'));
    uniq(tagIds, 'local entity tags');
    if (tagIds.some((id) => !world.tags.some((t) => t.id === id)))
      invalid('unpublished local entity tag.');
    // Canonical local-only geometry is exactly the authorized public placement,
    // never a second, unchecked copy of potentially private spatial metadata.
    if (placement.geometry.kind === 'polygon') {
      if (
        e.entityType !== 'location' ||
        JSON.stringify(e.geometry) !== JSON.stringify(placement.geometry)
      )
        invalid('non-canonical local-only polygon.');
    } else if (e.geometry !== undefined) {
      invalid('point local-only entity cannot carry a second geometry.');
    }
    if (
      ((e.entityType === 'character' || e.entityType === 'location') &&
        e.lifecycleStatus !== null &&
        e.lifecycleStatus !== undefined) ||
      (e.entityType === 'mission' &&
        !['active', 'completed', 'failed'].includes(String(e.lifecycleStatus))) ||
      (e.entityType === 'hazard' && !['active', 'resolved'].includes(String(e.lifecycleStatus)))
    )
      invalid('invalid local-only lifecycle.');
    if (
      e.portraitPath != null &&
      (e.entityType !== 'character' ||
        typeof e.portraitPath !== 'string' ||
        !/^portraits\/[0-9a-f-]+\.(?:jpg|png|webp)$/.test(e.portraitPath))
    )
      invalid('unsafe local-only portrait reference.');
    return e as unknown as PublicCampaignLocalMapV4['localOnlyEntities'][number];
  });
  uniq(
    localEntities.map(({ id }) => id),
    'local-only entities',
  );
  const localIds = new Set(localEntities.map(({ id }) => id));
  const allIds = new Set([...worldIds, ...localIds]);
  if (placements.some((p) => !allIds.has(p.entityId)))
    invalid('placement for unknown or private entity.');
  const findArr = (name: (typeof LOCAL)[number]) => array(row[name], 'local.' + name) as never[];
  const notes = findArr('notes') as PublicCampaignLocalMapV4['notes'];
  const dispositions = findArr('dispositions') as PublicCampaignLocalMapV4['dispositions'];
  const associations = findArr('associations') as PublicCampaignLocalMapV4['associations'];
  const relations = findArr('entityRelations') as PublicCampaignLocalMapV4['entityRelations'];
  const characterLocations = findArr(
    'characterLocationRelations',
  ) as PublicCampaignLocalMapV4['characterLocationRelations'];
  // Reject unknown JSON fields even if the containing V4 checksum is valid.
  // All auxiliary rows are part of the public payload and must not be able to
  // smuggle administrative metadata into a valid session cache.
  for (const [i, item] of dispositions.entries()) {
    const d = obj(item, 'local.dispositions[' + i + ']', ['entityId', 'playerId', 'disposition']);
    if (!['ally', 'enemy', 'neutral'].includes(String(d.disposition)))
      invalid('invalid local disposition.');
  }
  for (const [i, item] of associations.entries())
    obj(item, 'local.associations[' + i + ']', ['entityId', 'playerId']);
  for (const [i, item] of relations.entries()) {
    const relation = obj(item, 'local.entityRelations[' + i + ']', [
      'leftEntityId',
      'rightEntityId',
      'leftLabel',
      'rightLabel',
    ]);
    if (
      typeof relation.leftLabel !== 'string' ||
      !relation.leftLabel.trim() ||
      typeof relation.rightLabel !== 'string' ||
      !relation.rightLabel.trim() ||
      String(relation.leftEntityId) >= String(relation.rightEntityId)
    )
      invalid('invalid local relation.');
  }
  for (const [i, item] of characterLocations.entries()) {
    const relation = obj(item, 'local.characterLocationRelations[' + i + ']', [
      'characterId',
      'locationId',
      'relationStatus',
    ]);
    if (!['present', 'associated', 'last-seen'].includes(String(relation.relationStatus)))
      invalid('invalid local character/location relation.');
  }
  uniq(
    relations.map((r) => r.leftEntityId + '\u0000' + r.rightEntityId),
    'local entity relations',
  );
  uniq(
    characterLocations.map((r) => r.characterId + '\u0000' + r.locationId),
    'local character-location relations',
  );
  uniq(
    dispositions.map((d) => d.entityId + '\u0000' + d.playerId),
    'local dispositions',
  );
  uniq(
    associations.map((a) => a.entityId + '\u0000' + a.playerId),
    'local associations',
  );

  const tagIds = new Set(world.tags.map((t) => t.id));
  const playerIds = new Set(world.players.map((p) => p.id));
  uniq(
    notes.map((n) => n.id),
    'local note ids',
  );
  for (const note of notes) {
    const n = obj(note, 'local.note', [
      'id',
      'slug',
      'entityId',
      'title',
      'body',
      'sortOrder',
      'tagIds',
    ]);
    if (
      !localIds.has(n.entityId as never) ||
      typeof n.body !== 'string' ||
      typeof n.title !== 'string' ||
      !Number.isSafeInteger(n.sortOrder) ||
      array(n.tagIds, 'local.note.tagIds').some((t) => !tagIds.has(t as never))
    )
      invalid('local note references an unpublished entity or tag.');
  }
  if (
    notes.some((n) => !localIds.has(n.entityId)) ||
    dispositions.some((d) => !localIds.has(d.entityId) || !playerIds.has(d.playerId)) ||
    associations.some((a) => !localIds.has(a.entityId) || !playerIds.has(a.playerId)) ||
    relations.some(
      (r) =>
        !allIds.has(r.leftEntityId) ||
        !allIds.has(r.rightEntityId) ||
        (!localIds.has(r.leftEntityId) && !localIds.has(r.rightEntityId)),
    ) ||
    characterLocations.some(
      (r) =>
        !allIds.has(r.characterId) ||
        !allIds.has(r.locationId) ||
        (!localIds.has(r.characterId) && !localIds.has(r.locationId)),
    )
  )
    invalid('local auxiliary metadata references private/world-only identities.');
  const local: PublicCampaignLocalMapV4 = {
    campaignId,
    contexts: localContexts,
    geographicMapContextLinks: linked,
    placements,
    localOnlyEntities: localEntities,
    notes,
    dispositions,
    associations,
    entityRelations: relations,
    characterLocationRelations: characterLocations,
  };
  // The image-space parser and the same-revision world identity sets enforce
  // local spatial/auxiliary safety; world V2 coordinate bounds do not apply here.
  return local;
}
export function projectPublicCatalogSnapshotV4ToV2(
  snapshot: PublicCatalogSnapshotV4,
  campaignId: string,
): PublicCatalogSnapshotV2 | null {
  const { mapContexts: _contexts, campaignLocalMaps: _locals, ...v4World } = snapshot;
  void _contexts;
  void _locals;
  const v3: PublicCatalogSnapshotV3 = { ...v4World, schemaVersion: 3 };
  return projectPublicCatalogSnapshotV3ToV2(v3, campaignId);
}
export function localMapForCampaignV4(
  snapshot: PublicCatalogSnapshotV4,
  campaignId: string,
): PublicLocalMapData | null {
  return snapshot.campaignLocalMaps.find((m) => m.campaignId === campaignId) ?? null;
}
export async function parsePublicCatalogSnapshotV4(
  value: unknown,
  now: () => number = Date.now,
): Promise<PublicCatalogEnvelope> {
  const r = obj(value, 'snapshot', TOP);
  if (r.schemaVersion !== 4) {
    throw new PublicDataRepositoryError('unsupported-schema', 'Unknown public multi-map schema.', {
      source: 'snapshot',
      recoverable: false,
    });
  }
  const generatedAt = nonempty(r.generatedAt, 'snapshot.generatedAt');
  if (!Number.isFinite(Date.parse(generatedAt))) invalid('invalid generatedAt.');
  const sourceRevision = nonempty(r.sourceRevision, 'snapshot.sourceRevision', CHECKSUM);
  const checksum = nonempty(r.checksum, 'snapshot.checksum', CHECKSUM);
  const {
    generatedAt: _generatedAt,
    sourceRevision: _sourceRevision,
    checksum: _checksum,
    ...content
  } = r;
  void _generatedAt;
  void _sourceRevision;
  void _checksum;
  const actual = await createSha256Checksum(content);
  if (sourceRevision !== actual || checksum !== actual)
    throw new PublicDataRepositoryError('checksum-mismatch', 'Public V4 revision mismatch.', {
      source: 'snapshot',
      recoverable: false,
    });
  const worldContent = {
    schemaVersion: 3 as const,
    campaigns: r.campaigns,
    campaignCatalogs: r.campaignCatalogs,
    geographicNames: r.geographicNames,
  };
  const v3Hash = await createSha256Checksum(worldContent);
  const worldEnvelope = await parsePublicCatalogSnapshotV3(
    {
      ...worldContent,
      generatedAt,
      sourceRevision: v3Hash,
      checksum: v3Hash,
    },
    now,
  );
  if (worldEnvelope.data.contract !== 'beta03') invalid('invalid v3 world projection.');
  const world = worldEnvelope.data.catalog;
  const mapContexts = array(r.mapContexts, 'mapContexts').map(parseContext);
  uniq(
    mapContexts.map(({ id }) => id),
    'global map context ids',
  );
  uniq(
    mapContexts.map(({ slug }) => slug),
    'global map context slugs',
  );
  const contextById = new Map(mapContexts.map((c) => [c.id, c]));
  const geographicIds = new Set(world.geographicNames.map(({ id }) => id as string));
  const campaignIds = new Set(world.campaigns.map(({ id }) => id));
  const locals = array(r.campaignLocalMaps, 'campaignLocalMaps');
  if (locals.length !== campaignIds.size)
    invalid('every public campaign requires one local projection.');
  const campaignLocalMaps: PublicCampaignLocalMapV4[] = [];
  for (const [index, row] of locals.entries()) {
    const campaignId = (row as Record<string, unknown>)?.campaignId;
    const projected = projectPublicCatalogSnapshotV3ToV2(world, String(campaignId));
    if (!projected) invalid('local projection for missing campaign.');
    const local = parseLocal(row, index, campaignIds, geographicIds, contextById, projected);
    // Local image-space coordinates can exceed the world-map bounds; never
    // run them through the *world-only* V2 geometry validator.
    // The local placement parser above enforces its own context bounds.
    mergePublicLocalCatalog(projected, local);
    campaignLocalMaps.push(local);
  }
  uniq(
    campaignLocalMaps.map(({ campaignId }) => campaignId),
    'campaign local maps',
  );
  const usedContextIds = new Set(
    campaignLocalMaps.flatMap((m) => m.geographicMapContextLinks.map((l) => l.contextId)),
  );
  if (mapContexts.some((c) => !usedContextIds.has(c.id))) invalid('unbound global map context.');
  const snapshot: PublicCatalogSnapshotV4 = {
    schemaVersion: 4,
    generatedAt,
    sourceRevision,
    checksum,
    // Preserve the exact hashed V4 world representation: V3's compatibility
    // parser normalizes optional arrays, which MUST NOT mutate a V4 checksum.
    campaigns: r.campaigns as PublicCatalogSnapshotV4['campaigns'],
    campaignCatalogs: r.campaignCatalogs as PublicCatalogSnapshotV4['campaignCatalogs'],
    geographicNames: r.geographicNames as PublicCatalogSnapshotV4['geographicNames'],
    mapContexts,
    campaignLocalMaps,
  };
  return {
    data: { contract: 'beta04', catalog: snapshot },
    source: 'session-cache',
    metadata: {
      contract: 'beta04',
      schemaVersion: 4,
      generatedAt,
      loadedAt: new Date(now()).toISOString(),
      sourceRevision,
      checksum,
      stale: false,
    },
  };
}
