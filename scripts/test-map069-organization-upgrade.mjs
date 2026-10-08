import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const NPX_COMMAND = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const PRE_MAP069_VERSION = '20261007080000';
const MAP069_MIGRATION = new URL(
  '../supabase/migrations/20261008180000_add_nonspatial_organizations.sql',
  import.meta.url,
);

function fail(message) {
  throw new Error(`MAP-069 organization upgrade verification failed: ${message}`);
}

function run(command, args, description, input) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    input,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) fail(`${description}: ${result.error.message}`);
  if (result.status !== 0) fail(`${description} exited with status ${result.status ?? 'unknown'}`);
  return result.stdout.trim();
}

function psql(sql) {
  return run(
    'docker',
    [
      'exec',
      '--interactive',
      '--user',
      'postgres',
      DATABASE_CONTAINER,
      'psql',
      '--username',
      'postgres',
      '--dbname',
      'postgres',
      '--no-psqlrc',
      '--set=ON_ERROR_STOP=1',
      '--quiet',
      '--tuples-only',
      '--no-align',
    ],
    'running MAP-069 rehearsal SQL',
    sql,
  );
}

run(
  NPX_COMMAND,
  [
    '--no-install',
    'supabase',
    'db',
    'reset',
    '--local',
    '--version',
    PRE_MAP069_VERSION,
    '--no-seed',
  ],
  'resetting to the MAP-068 schema boundary',
);

const before = psql(`
select pg_catalog.jsonb_build_object(
  'campaigns', (select count(*) from public.campaigns),
  'entities', (select count(*) from public.map_entities),
  'veyra', (select count(*) from public.map_entities where name = 'Veyra'),
  'ura', (select count(*) from public.map_entities where name = 'Ura'),
  'skade', (select count(*) from public.map_entities where name = 'Skade'),
  'requests', (select count(*) from public.public_requests),
  'dispositions', (select count(*) from public.entity_player_dispositions),
  'notes', (select count(*) from public.public_notes),
  'character_location_relations', (select count(*) from public.character_location_relations),
  'missions', (select count(*) from public.map_entities where entity_type = 'mission'),
  'hazards', (select count(*) from public.map_entities where entity_type = 'hazard')
)::text;
`);

psql(readFileSync(MAP069_MIGRATION, 'utf8'));

const after = psql(`
select pg_catalog.jsonb_build_object(
  'campaigns', (select count(*) from public.campaigns),
  'entities', (select count(*) from public.map_entities),
  'veyra', (select count(*) from public.map_entities where name = 'Veyra'),
  'ura', (select count(*) from public.map_entities where name = 'Ura'),
  'skade', (select count(*) from public.map_entities where name = 'Skade'),
  'requests', (select count(*) from public.public_requests),
  'dispositions', (select count(*) from public.entity_player_dispositions),
  'notes', (select count(*) from public.public_notes),
  'character_location_relations', (select count(*) from public.character_location_relations),
  'missions', (select count(*) from public.map_entities where entity_type = 'mission'),
  'hazards', (select count(*) from public.map_entities where entity_type = 'hazard')
)::text;
`);

if (before !== after) {
  fail(`legacy graph changed during upgrade:\nbefore=${before}\nafter=${after}`);
}

const contract = JSON.parse(
  psql(`
insert into public.categories (
  campaign_id, id, slug, name, description, publication_status
)
select id, 'category-map069-rehearsal', 'map069-rehearsal', 'MAP069 Rehearsal', '', 'published'
from public.campaigns
order by display_order, id
limit 1;

insert into public.map_entities (
  campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
  x, y, category_id, publication_status
)
select id, 'entity-map069-rehearsal-org', 'map069-rehearsal-org', 'organization',
  'search_only', 'public', 'MAP069 Rehearsal Organization', '', '', null, null,
  'category-map069-rehearsal', 'draft'
from public.campaigns
order by display_order, id
limit 1;

select pg_catalog.jsonb_build_object(
  'entity_types', (
    select pg_catalog.jsonb_agg(enumlabel order by enumsortorder)
    from pg_catalog.pg_enum
    where enumtypid = 'public.entity_type'::pg_catalog.regtype
  ),
  'organization', (
    select pg_catalog.jsonb_build_object(
      'x', x,
      'y', y,
      'geometry', geometry,
      'visibility', visibility,
      'lifecycle', lifecycle_status
    )
    from public.map_entities
    where id = 'entity-map069-rehearsal-org'
  ),
  'spatial_complete', not exists (
    select 1
    from public.map_entities
    where entity_type <> 'organization'
      and (x is null or y is null or geometry is null)
  ),
  'generic_relations_table', to_regclass('public.entity_relations') is not null
)::text;
`),
);

if (!contract.entity_types.includes('organization')) fail('organization enum value is absent');
if (
  contract.organization.x !== null ||
  contract.organization.y !== null ||
  contract.organization.geometry !== null ||
  contract.organization.visibility !== 'search_only' ||
  contract.organization.lifecycle !== null
) {
  fail('organization did not preserve the explicit non-spatial contract');
}
if (!contract.spatial_complete) fail('an existing spatial entity lost x/y/geometry');
if (!contract.generic_relations_table) fail('generic entity relation table is absent');

process.stdout.write('MAP-069 organization upgrade rehearsal passed.\n');
