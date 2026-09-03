import { spawnSync } from 'node:child_process';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const NODE_COMMAND = process.execPath;

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

run(
  NODE_COMMAND,
  ['scripts/test-map053-v1-upgrade.mjs'],
  'running the exact v1.0 baseline upgrade fixture',
);

const sql = String.raw`
with checks as (
  select
    (select count(*) from public.campaigns) = 1 as one_campaign,
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
