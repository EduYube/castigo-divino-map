import fs from 'node:fs';

function patch(path, replacements) {
  let text = fs.readFileSync(path, 'utf8');
  for (const [from, to, label] of replacements) {
    if (!text.includes(from)) throw new Error(`${path}: missing ${label}`);
    text = text.replaceAll(from, to);
  }
  fs.writeFileSync(path, text);
}

patch('src/infrastructure/supabase/publicCatalogCodec.ts', [
  ["        'entityType',\n        'visibility',", "        'entityType',\n        'lifecycleStatus',\n        'visibility',", 'snapshot lifecycle property'],
  ["      entity_type: entity.entityType,\n      visibility: entity.visibility,", "      entity_type: entity.entityType,\n      lifecycle_status: entity.lifecycleStatus ?? null,\n      visibility: entity.visibility,", 'snapshot lifecycle row'],
]);

patch('src/app/adminCampaignScope.test.ts', [
  ['/rpc/admin_get_map_entity_editor_v6', '/rpc/admin_get_map_entity_editor_v7', 'editor v7 expectation'],
  ['/rpc/admin_save_map_entity_v6', '/rpc/admin_save_map_entity_v7', 'save v7 expectation'],
  ['rewrites save through the geometry-aware RPC', 'rewrites save through the lifecycle-aware geometry RPC', 'save test title'],
]);

patch('src/infrastructure/supabase/masterCatalogRepository.test.ts', [
  ['admin_get_master_catalog_v5', 'admin_get_master_catalog_v6', 'master lifecycle RPC expectations'],
  ['geometry-aware v5 RPC', 'lifecycle-aware v6 RPC', 'master test title'],
]);

console.log('MAP-064 compatibility contract patch applied');
