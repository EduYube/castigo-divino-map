import { spawnSync } from 'node:child_process';
import { renameSync } from 'node:fs';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const NODE_COMMAND = process.execPath;
const NPX_COMMAND = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const MAP068_MIGRATION = new URL(
  '../supabase/migrations/20261007080000_separate_veyra_un_aliento_menos.sql',
  import.meta.url,
);
const MAP068_HIDDEN = new URL(
  '../supabase/migrations/20261007080000_separate_veyra_un_aliento_menos.sql.rehearsal-hidden',
  import.meta.url,
);
const MAP069_MIGRATION = new URL(
  '../supabase/migrations/20261008180000_add_nonspatial_organizations.sql',
  import.meta.url,
);
const MAP069_HIDDEN = new URL(
  '../supabase/migrations/20261008180000_add_nonspatial_organizations.sql.rehearsal-hidden',
  import.meta.url,
);

function fail(message) {
  throw new Error(`MAP-066 v1.0 → v1.1 rehearsal failed: ${message}`);
}

function run(command, args, description) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) fail(`${description}: ${result.error.message}`);
  if (result.status !== 0) fail(`${description} exited with status ${result.status ?? 'unknown'}`);
  return result.stdout.trim();
}

renameSync(MAP068_MIGRATION, MAP068_HIDDEN);
renameSync(MAP069_MIGRATION, MAP069_HIDDEN);
try {
  run(
    NODE_COMMAND,
    ['scripts/test-map053-v1-upgrade.mjs'],
    'running the exact v1.0 baseline upgrade fixture through pre-MAP-068',
  );
} finally {
  renameSync(MAP068_HIDDEN, MAP068_MIGRATION);
  renameSync(MAP069_HIDDEN, MAP069_MIGRATION);
}

const checkpointSql = String.raw`
-- MAP-066 validates the full v1.0 → v1.1 path, while MAP-068 deliberately
-- fails closed against the audited production Veyra state. Normalize only
-- this local rehearsal to that legitimate pre-MAP-068 checkpoint.

insert into auth.users (id)
values ('00000000-0000-4000-8000-000000000068')
on conflict (id) do nothing;

alter table public.map_entities disable trigger "60_map_entity_identifier";
alter table public.map_entities disable trigger "70_map_entity_reserve";

insert into public.map_entities (
  campaign_id,id,slug,entity_type,visibility,audience,name,name_language,
  summary,description,x,y,category_id,publication_status
)
select
  '00000000-0000-4000-8000-000000000053'::uuid,
  source.id,
  'map066-' || source.ordinal,
  'character'::public.entity_type,
  'pin'::public.map_visibility,
  'public'::public.entity_audience,
  'MAP066 Veyra peer ' || source.ordinal,
  'en',
  '',
  'Synthetic audited pre-MAP-068 compatibility fixture',
  1500 + source.ordinal,
  1000 + source.ordinal,
  (select category_id from public.map_entities
    where id='entity-request-07d26371bbff42d9b91e076d099891b0'),
  'published'::public.publication_status
from (
  values
    ('entity-agamen',1),('entity-asentamiento-thar',2),('entity-bring',3),
    ('entity-captitan',4),('entity-jhonny',5),('entity-masred',6),
    ('entity-memnon',7),('entity-myrath',8),('entity-ojos-tempestad',9),
    ('entity-thalasis',10),('entity-thar',11),('entity-tulu',12),
    ('place-demo-harbor',13),('place-demo-pass',14)
) as source(id,ordinal)
on conflict (id) do nothing;

alter table public.map_entities enable trigger "60_map_entity_identifier";
alter table public.map_entities enable trigger "70_map_entity_reserve";

alter table public.public_requests disable trigger "20_validate_public_request";
insert into public.public_requests (
  id,campaign_id,sender_name,proposed_name,entity_type,x,y,description,reason,
  request_status,moderator_user_id,converted_entity_id,moderated_at
) values (
  '07d26371-bbff-42d9-b91e-076d099891b0',
  '00000000-0000-4000-8000-000000000053',
  'Veyra la Grandiosa','Veyra','character',1438.727724022,1837.31274570082,
  'Posición inicial Veyra (dudo entre neverwinter y lidian)','Inicio partida picara',
  'converted','00000000-0000-4000-8000-000000000068',
  'entity-request-07d26371bbff42d9b91e076d099891b0',pg_catalog.now()
)
on conflict (id) do update set
  campaign_id=excluded.campaign_id,
  request_status=excluded.request_status,
  moderator_user_id=excluded.moderator_user_id,
  converted_entity_id=excluded.converted_entity_id,
  moderated_at=excluded.moderated_at;
alter table public.public_requests enable trigger "20_validate_public_request";

delete from public.entity_player_dispositions
where player_id='player-veyra'
   or entity_id='entity-request-07d26371bbff42d9b91e076d099891b0';

insert into public.entity_player_dispositions(entity_id,player_id,campaign_id,disposition)
values
  ('entity-agamen','player-veyra','00000000-0000-4000-8000-000000000053','neutral'),
  ('entity-asentamiento-thar','player-veyra','00000000-0000-4000-8000-000000000053','neutral'),
  ('entity-bring','player-veyra','00000000-0000-4000-8000-000000000053','neutral'),
  ('entity-captitan','player-veyra','00000000-0000-4000-8000-000000000053','neutral'),
  ('entity-jhonny','player-veyra','00000000-0000-4000-8000-000000000053','neutral'),
  ('entity-masred','player-veyra','00000000-0000-4000-8000-000000000053','neutral'),
  ('entity-memnon','player-veyra','00000000-0000-4000-8000-000000000053','neutral'),
  ('entity-myrath','player-veyra','00000000-0000-4000-8000-000000000053','neutral'),
  ('entity-ojos-tempestad','player-veyra','00000000-0000-4000-8000-000000000053','neutral'),
  ('entity-request-07d26371bbff42d9b91e076d099891b0','player-skade','00000000-0000-4000-8000-000000000053','neutral'),
  ('entity-request-07d26371bbff42d9b91e076d099891b0','player-ura','00000000-0000-4000-8000-000000000053','neutral'),
  ('entity-request-07d26371bbff42d9b91e076d099891b0','player-veyra','00000000-0000-4000-8000-000000000053','neutral'),
  ('entity-skade','player-veyra','00000000-0000-4000-8000-000000000053','neutral'),
  ('entity-thalasis','player-veyra','00000000-0000-4000-8000-000000000053','neutral'),
  ('entity-thar','player-veyra','00000000-0000-4000-8000-000000000053','neutral'),
  ('entity-tulu','player-veyra','00000000-0000-4000-8000-000000000053','neutral'),
  ('entity-ura','player-veyra','00000000-0000-4000-8000-000000000053','neutral'),
  ('place-demo-harbor','player-veyra','00000000-0000-4000-8000-000000000053','neutral'),
  ('place-demo-pass','player-veyra','00000000-0000-4000-8000-000000000053','neutral');
`;

run(
  'docker',
  [
    'exec',
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
    '--command',
    checkpointSql,
  ],
  'preparing the audited pre-MAP-068 checkpoint',
);

run(
  NPX_COMMAND,
  ['--no-install', 'supabase', 'migration', 'up', '--local'],
  'applying MAP-068 after the v1.0 compatibility checkpoint',
);

const sql = String.raw`
with checks as (
  select
    (
      select count(*) = 2
      from public.campaigns
      where (id = '00000000-0000-4000-8000-000000000053'
          and slug = 'castigo-divino'
          and name = 'Castigo Divino'
          and status = 'active')
         or (id = '00000000-0000-4000-8000-000000000068'
          and slug = 'un-aliento-menos'
          and name = 'Un aliento menos'
          and status = 'active')
    ) and (select count(*) from public.campaigns) = 2 as campaign_set_complete,
    exists (
      select 1 from public.campaigns
      where id = '00000000-0000-4000-8000-000000000053'
        and slug = 'castigo-divino'
        and status = 'active'
    ) as initial_campaign_preserved,
    exists (
      select 1 from public.map_entities
      where id = 'entity-map053-upgrade-character'
        and slug = 'map053-upgrade-character'
        and x = 1200
        and y = 800
        and portrait_path = 'portraits/11111111-1111-4111-8111-111111111111.png'
        and audience = 'public'
        and publication_status = 'published'
        and created_at = '2026-06-01T00:03:00Z'::timestamptz
        and updated_at = '2026-07-02T00:03:00Z'::timestamptz
    ) as public_entity_identity_preserved,
    exists (
      select 1 from public.map_entities
      where id = 'entity-map053-upgrade-location'
        and slug = 'map053-upgrade-location'
        and x = 1300
        and y = 900
        and audience = 'master'
        and publication_status = 'published'
        and created_at = '2026-06-01T00:04:00Z'::timestamptz
        and updated_at = '2026-07-02T00:04:00Z'::timestamptz
    ) as master_entity_identity_preserved,
    not exists (
      select 1 from public.map_entities
      where campaign_id is null or geometry is null
    ) as scoped_entities_complete,
    not exists (
      select 1 from public.map_entities
      where geometry->>'kind' = 'point'
        and (
          (geometry->'coordinates'->>'x')::double precision <> x
          or (geometry->'coordinates'->>'y')::double precision <> y
        )
    ) as point_geometry_matches_legacy_coordinates,
    exists (
      select 1 from public.entity_aliases
      where entity_id = 'entity-map053-upgrade-character'
    ) as aliases_preserved,
    exists (
      select 1 from public.entity_tags
      where entity_id = 'entity-map053-upgrade-character'
        and tag_id = 'map053-upgrade-tag'
    ) as tags_preserved,
    exists (
      select 1 from public.entity_player_dispositions
      where entity_id = 'entity-map053-upgrade-character'
        and player_id = 'player-map053-upgrade'
        and disposition = 'ally'
    ) as dispositions_preserved,
    exists (
      select 1 from public.character_location_relations
      where character_id = 'entity-map053-upgrade-character'
        and location_id = 'entity-map053-upgrade-location'
    ) as relations_preserved,
    exists (
      select 1 from public.character_location_events
      where character_id = 'entity-map053-upgrade-character'
        and location_entity_id = 'entity-map053-upgrade-location'
    ) as history_preserved,
    exists (
      select 1 from public.public_notes
      where entity_id = 'entity-map053-upgrade-character'
    ) as notes_preserved,
    exists (
      select 1
      from public.public_note_tags pnt
      join public.public_notes pn on pn.id = pnt.note_id
      where pn.entity_id = 'entity-map053-upgrade-character'
    ) as note_tags_preserved,
    exists (
      select 1 from public.public_requests
      where id = '20000000-0000-4000-8000-000000000053'
        and converted_entity_id = 'entity-request-20000000000040008000000000000053'
    ) as converted_request_preserved,
    (
      select count(*) from public.map_entities
      where id in (
        'entity-map053-upgrade-character',
        'entity-map053-upgrade-location',
        'entity-skade',
        'entity-ura',
        'entity-request-07d26371bbff42d9b91e076d099891b0'
      )
    ) = 5 as no_entity_duplication,
    (
      select count(*)
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = 'entity_type'
        and e.enumlabel in ('character', 'location', 'mission', 'hazard')
    ) = 4 as v11_entity_types_available
)
select to_jsonb(checks)::text from checks;
`;

const raw = run(
  'docker',
  [
    'exec',
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
    '--command',
    sql,
  ],
  'checking current v1.1 invariants',
);
const result = JSON.parse(raw.split(/\r?\n/u).filter(Boolean).at(-1));
const failures = Object.entries(result)
  .filter(([, ok]) => ok !== true)
  .map(([name]) => name);
if (failures.length) fail(`failed invariants: ${failures.join(', ')}`);
console.log(
  `MAP-066 v1.0 → v1.1 rehearsal passed: ${Object.keys(result).length} cross-release invariants, zero manual recreation.`,
);
