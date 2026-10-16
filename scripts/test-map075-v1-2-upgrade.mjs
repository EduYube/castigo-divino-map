import { spawnSync } from 'node:child_process';

const CONTAINER = 'supabase_db_castigo-divino-map';
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';
function run(command, args, label, input) {
  const output = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, input });
  if (output.error || output.status !== 0) {
    throw new Error(`MAP-075 ${label}: ${output.error?.message ?? output.stderr ?? output.status}`);
  }
  return output.stdout.trim();
}
function psql(sql) {
  return run('docker', [
    'exec', '--interactive', '--user', 'postgres', CONTAINER, 'psql',
    '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
    '--set=ON_ERROR_STOP=1', '--quiet', '--tuples-only', '--no-align',
  ], 'psql', sql);
}
run(NPX, [
  '--no-install', 'supabase', 'db', 'reset', '--local',
  '--version', '20261008180000', '--no-seed',
], 'reset to v1.2 final migration');

psql(`
insert into public.categories(campaign_id,id,slug,name,description,publication_status)
values ('00000000-0000-4000-8000-000000000053','category-map075-upgrade',
        'map075-upgrade','MAP075 upgrade','','published');
insert into public.map_entities
 (campaign_id,id,slug,entity_type,visibility,audience,name,summary,description,
 x,y,geometry,category_id,publication_status)
values
 ('00000000-0000-4000-8000-000000000053','place-map075-rehearsal',
  'map075-rehearsal','location','pin','public','MAP075 rehearsal place','','',
  45,66,'{"kind":"polygon","vertices":[{"x":20,"y":20},{"x":60,"y":20},{"x":60,"y":100}]}',
  'category-map075-upgrade','published');
insert into public.map_entities
 (campaign_id,id,slug,entity_type,visibility,audience,name,summary,description,
 x,y,category_id,publication_status)
values ('00000000-0000-4000-8000-000000000053','entity-map075-rehearsal-org',
        'map075-rehearsal-org','organization','search_only','public',
        'MAP075 rehearsal organization','','',null,null,'category-map075-upgrade','published');
insert into public.entity_relations
 (campaign_id,left_entity_id,right_entity_id,left_label,right_label)
values ('00000000-0000-4000-8000-000000000053',
        'entity-map075-rehearsal-org','place-map075-rehearsal',
        'Relacionado','Relacionado');
`);

const check = `
select pg_catalog.jsonb_build_object(
  'campaigns', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) order by c.id)
                from public.campaigns c),
  'entities', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',e.id,'slug',e.slug,'campaign_id',e.campaign_id,'x',e.x,'y',e.y,
    'geometry',e.geometry,'type',e.entity_type,'status',e.publication_status,
    'created_at',e.created_at,'updated_at',e.updated_at,
    'published_at',e.published_at,'archived_at',e.archived_at
  ) order by e.id) from public.map_entities e),
  'relations', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.campaign_id,
                  r.left_entity_id,r.right_entity_id) from public.entity_relations r),
  'organizations', (select count(*) from public.map_entities
                    where entity_type='organization' and x is null and y is null and geometry is null),
  'players', (select count(*) from public.players),
  'dispositions', (select count(*) from public.entity_player_dispositions),
  'associations', (select count(*) from public.entity_player_associations),
  'notes', (select count(*) from public.public_notes),
  'requests', (select count(*) from public.public_requests),
  'locations', (select count(*) from public.character_location_relations),
  'geography_links', (select count(*) from public.campaign_geographic_entity_links)
)::text;
`;
const before = psql(check);
run(NPX, ['--no-install','supabase','migration','up','--local'], 'migrate to MAP-075');
const after = psql(check);
if (before !== after) {
  throw new Error(`MAP-075 changed v1.2 canonical rows or editorial timestamps:\nbefore=${before}\nafter=${after}`);
}
const newTables = JSON.parse(psql(`
select pg_catalog.jsonb_build_object(
 'contexts',(select count(*) from public.map_contexts),
 'placements',(select count(*) from public.entity_map_placements),
 'world_default',(select count(*) from public.map_entities
   where not world_map_enabled),
 'migration_applied',pg_catalog.to_regclass('public.entity_map_placements') is not null
)::text;
`));
if (newTables.contexts !== 0 || newTables.placements !== 0 ||
    newTables.world_default !== 0 || !newTables.migration_applied) {
  throw new Error(`MAP-075 expansion invariant failed: ${JSON.stringify(newTables)}`);
}
process.stdout.write('MAP-075 v1.2 -> optional maps rehearsal passed; old rows unchanged.\\n');
