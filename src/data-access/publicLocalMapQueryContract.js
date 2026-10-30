/**
 * MAP-080 shared public REST contract. All callers use exact-count ranged reads
 * from publicCatalogQueryContract and MUST validate the full revision before publishing.
 */
export const PUBLIC_LOCAL_MAP_TABLE_QUERIES = Object.freeze({
  links: Object.freeze({
    name: 'campaign_geographic_map_context_links',
    select: 'campaign_id,geographic_name_id,map_context_id,map_contexts!inner(id,slug,name,parent_id,width,height,image_uri,publication_status)',
    order: 'geographic_name_id.asc,map_context_id.asc',
    published: false,
    campaignScoped: true,
  }),
  placements: Object.freeze({
    name: 'entity_map_placements',
    select: 'campaign_id,map_context_id,entity_id,geometry,x,y,publication_status',
    order: 'map_context_id.asc,entity_id.asc',
    published: true,
    campaignScoped: true,
  }),
  localEntities: Object.freeze({
    name: 'map_entities',
    select: 'id,slug,entity_type,lifecycle_status,visibility,name,name_language,summary,description,portrait_path,x,y,geometry,category_id,world_map_enabled,publication_status,audience',
    order: 'id.asc',
    published: true,
    campaignScoped: true,
    worldMapEnabled: false,
  }),
});
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GEO = /^geo-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAP = /^map-[a-z0-9]+(?:-[a-z0-9]+)*$/;
function invalid(message) { throw new Error('Invalid public local map binding: ' + message); }
function exactKeys(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path + ' object');
  for (const key of Object.keys(value)) if (!keys.includes(key)) invalid(path + ' extra key: ' + key);
  return value;
}
/**
 * Reject rather than silently skip any malformed/unpublished/unbound rows.
 * This function is used by the remote envelope, snapshot generator and verifier.
 * A disconnected map context is never returned.
 */
export function projectPublicMapContextLinks(rawLinks, campaignId, geographicIds) {
  if (!Array.isArray(rawLinks)) invalid('links must be an array');
  const contextsById = new Map();
  const geographicMapContextLinks = [];
  const seen = new Set();
  for (const [i, raw] of rawLinks.entries()) {
    const row = exactKeys(raw, ['campaign_id','geographic_name_id','map_context_id','map_contexts'], 'link ' + i);
    const id = row.geographic_name_id;
    const c = exactKeys(row.map_contexts, ['id','slug','name','parent_id','width','height','image_uri','publication_status'], 'context ' + i);
    if (row.campaign_id !== campaignId || typeof id !== 'string' || !GEO.test(id) ||
        !geographicIds.has(id) || typeof c.id !== 'string' || !MAP.test(c.id) ||
        row.map_context_id !== c.id || c.publication_status !== 'published' ||
        typeof c.slug !== 'string' || !SLUG.test(c.slug) ||
        typeof c.name !== 'string' || !c.name.trim() ||
        !Number.isSafeInteger(c.width) || !Number.isSafeInteger(c.height) ||
        c.width <= 0 || c.height <= 0 ||
        !(c.parent_id == null || (typeof c.parent_id === 'string' && MAP.test(c.parent_id))) ||
        !(c.image_uri == null || (typeof c.image_uri === 'string' && /^https:\/\//.test(c.image_uri)))) {
      invalid('unpublished, cross-campaign, unbound or malformed row ' + i);
    }
    if (seen.has(id)) invalid('duplicate geographic binding: ' + id);
    seen.add(id);
    const context = { id:c.id, slug:c.slug, name:c.name, parentId:c.parent_id ?? null,
      width:c.width, height:c.height, imageUri:c.image_uri ?? null };
    const existing = contextsById.get(c.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(context))
      invalid('conflicting context: ' + c.id);
    contextsById.set(c.id,context);
    geographicMapContextLinks.push({campaignId, geographicNameId:id, contextId:c.id});
  }
  const mapContexts = [...contextsById.values()].sort((a,b)=>a.id.localeCompare(b.id));
  const contexts = mapContexts.map(({id,slug,name,width,height})=>({id,slug,name,width,height}));
  geographicMapContextLinks.sort((a,b)=>a.geographicNameId.localeCompare(b.geographicNameId));
  return {mapContexts, contexts, geographicMapContextLinks};
}
