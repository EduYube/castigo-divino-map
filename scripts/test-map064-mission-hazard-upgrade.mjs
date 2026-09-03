import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const NPX_COMMAND = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const PRE_MAP064_VERSION = '20260901150300';
const PHASE_ONE_MIGRATION = new URL(
  '../supabase/migrations/20260902110000_add_mission_hazard_entity_types.sql',
  import.meta.url,
);

function fail(message) {
  throw new Error(`MAP-064 mission/hazard upgrade verification failed: ${message}`);
}

function runCommand(command, argumentsList, description) {
  const result = spawnSync(command, argumentsList, {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) fail(`${description}: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`${description} exited with status ${result.status ?? 'unknown'}`);
  }
}

function resetToPreMap064(description) {
  runCommand(
    NPX_COMMAND,
    [
      '--no-install',
      'supabase',
      'db',
      'reset',
      '--local',
      '--version',
      PRE_MAP064_VERSION,
      '--no-seed',
    ],
    description,
  );
}

function findDatabaseContainer() {
  const result = spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.error) fail(`Docker could not be executed: ${result.error.message}`);
  if (result.status !== 0) {
    fail(result.stderr.trim() || `docker ps exited with status ${result.status ?? 'unknown'}`);
  }

  const runningContainers = result.stdout.split(/\r?\n/u).filter(Boolean);
  if (!runningContainers.includes(DATABASE_CONTAINER)) {
    fail(`Expected running local database container ${DATABASE_CONTAINER}`);
  }

  return DATABASE_CONTAINER;
}

function runPsql(containerName, sql) {
  const result = spawnSync(
    'docker',
    [
      'exec',
      '--user',
      'postgres',
      containerName,
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
    { encoding: 'utf8', windowsHide: true },
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) fail(`Unable to run psql: ${result.error.message}`);
  if (result.status !== 0) {
    fail(result.stderr.trim() || `psql exited with status ${result.status ?? 'unknown'}`);
  }

  return result.stdout.trim();
}

function runPsqlScript(containerName, sql, description) {
  const result = spawnSync(
    'docker',
    [
      'exec',
      '--interactive',
      '--user',
      'postgres',
      containerName,
      'psql',
      '--username',
      'postgres',
      '--dbname',
      'postgres',
      '--no-psqlrc',
      '--set=ON_ERROR_STOP=1',
      '--quiet',
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
      input: sql,
    },
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) fail(`${description}: ${result.error.message}`);
  if (result.status !== 0) {
    fail(result.stderr.trim() || `${description} exited with status ${result.status ?? 'unknown'}`);
  }
}

function snapshotLegacyGraph(containerName) {
  return runPsql(
    containerName,
    `select pg_catalog.jsonb_build_object(
       'entities', coalesce((
         select pg_catalog.jsonb_agg(row_value order by row_value::text)
         from (
           select pg_catalog.to_jsonb(entity) - 'lifecycle_status' as row_value
           from public.map_entities as entity
         ) as rows
       ), '[]'::jsonb),
       'aliases', coalesce((
         select pg_catalog.jsonb_agg(row_value order by row_value::text)
         from (select pg_catalog.to_jsonb(alias) as row_value from public.entity_aliases as alias) as rows
       ), '[]'::jsonb),
       'tags', coalesce((
         select pg_catalog.jsonb_agg(row_value order by row_value::text)
         from (select pg_catalog.to_jsonb(link) as row_value from public.entity_tags as link) as rows
       ), '[]'::jsonb),
       'dispositions', coalesce((
         select pg_catalog.jsonb_agg(row_value order by row_value::text)
         from (
           select pg_catalog.to_jsonb(disposition) as row_value
           from public.entity_player_dispositions as disposition
         ) as rows
       ), '[]'::jsonb),
       'associations', coalesce((
         select pg_catalog.jsonb_agg(row_value order by row_value::text)
         from (
           select pg_catalog.to_jsonb(association) as row_value
           from public.entity_player_associations as association
         ) as rows
       ), '[]'::jsonb),
       'notes', coalesce((
         select pg_catalog.jsonb_agg(row_value order by row_value::text)
         from (select pg_catalog.to_jsonb(note) as row_value from public.public_notes as note) as rows
       ), '[]'::jsonb),
       'note_tags', coalesce((
         select pg_catalog.jsonb_agg(row_value order by row_value::text)
         from (
           select pg_catalog.to_jsonb(note_tag) as row_value
           from public.public_note_tags as note_tag
         ) as rows
       ), '[]'::jsonb)
     )::text;`,
  );
}

resetToPreMap064('resetting the local database for the MAP-064 phase-one rollout rehearsal');

let containerName = findDatabaseContainer();
const phaseOneSql = readFileSync(PHASE_ONE_MIGRATION, 'utf8');
runPsqlScript(
  containerName,
  phaseOneSql,
  'applying only the MAP-064 phase-one enum/ingress migration',
);

const boundaryContract = JSON.parse(
  runPsql(
    containerName,
    `select pg_catalog.jsonb_build_object(
       'entity_types', (
         select pg_catalog.jsonb_agg(enumlabel order by enumsortorder)
         from pg_catalog.pg_enum
         where enumtypid = 'public.entity_type'::pg_catalog.regtype
       ),
       'public_request_constraint', exists (
         select 1
         from pg_catalog.pg_constraint
         where conrelid = 'public.public_requests'::pg_catalog.regclass
           and conname = 'public_requests_supported_entity_type_check'
           and contype = 'c'
       ),
       'lifecycle_column', exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'map_entities'
           and column_name = 'lifecycle_status'
       )
     )::text;`,
  ),
);

if (
  JSON.stringify(boundaryContract.entity_types) !==
  JSON.stringify(['character', 'location', 'mission', 'hazard'])
) {
  fail(
    `phase one did not expose the expected entity_type values: ${JSON.stringify(boundaryContract.entity_types)}`,
  );
}
if (boundaryContract.public_request_constraint !== true) {
  fail('phase one exposed mission/hazard before installing the public_requests type constraint');
}
if (boundaryContract.lifecycle_column !== false) {
  fail('phase-one rehearsal unexpectedly crossed into the lifecycle migration');
}

runPsql(
  containerName,
  `set role anon;
   do $map064_public_ingress$
   declare
     unsupported_type text;
   begin
     foreach unsupported_type in array array['mission', 'hazard'] loop
       begin
         perform public.submit_public_request_v3(
           'not-a-token',
           'Boundary sender',
           'Boundary proposal',
           unsupported_type::public.entity_type,
           1,
           1,
           'Boundary description',
           'Boundary reason',
           null
         );
         raise exception 'unsupported public entity type % was accepted', unsupported_type;
       exception
         when sqlstate '22023' then
           if sqlerrm <> 'invalid public request' then
             raise exception
               'unsupported public entity type % reached token parsing first: %',
               unsupported_type,
               sqlerrm;
           end if;
       end;
     end loop;
   end
   $map064_public_ingress$;
   reset role;`,
);

runPsql(
  containerName,
  `do $map064_public_constraint$
   declare
     unsupported_type text;
     rejected_constraint text;
     target_campaign uuid;
   begin
     select entity.campaign_id
     into target_campaign
     from public.map_entities as entity
     limit 1;

     if target_campaign is null then
       raise exception 'phase-one rehearsal requires a historical campaign';
     end if;

     foreach unsupported_type in array array['mission', 'hazard'] loop
       begin
         insert into public.public_requests (
           campaign_id, sender_name, proposed_name, entity_type, x, y, description, reason
         ) values (
           target_campaign,
           'Boundary sender',
           'Boundary proposal',
           unsupported_type::public.entity_type,
           1,
           1,
           'Boundary description',
           'Boundary reason'
         );
         raise exception 'public_requests accepted unsupported type %', unsupported_type;
       exception
         when check_violation then
           get stacked diagnostics rejected_constraint = constraint_name;
           if rejected_constraint <> 'public_requests_supported_entity_type_check' then
             raise exception
               'unsupported type % was rejected by unexpected constraint %',
               unsupported_type,
               rejected_constraint;
           end if;
       end;
     end loop;
   end
   $map064_public_constraint$;`,
);

const boundaryUnsupportedRows = Number(
  runPsql(
    containerName,
    `select pg_catalog.count(*)
     from public.public_requests
     where entity_type in ('mission'::public.entity_type, 'hazard'::public.entity_type);`,
  ),
);
if (boundaryUnsupportedRows !== 0) {
  fail(`phase-one boundary persisted ${boundaryUnsupportedRows} unsupported public requests`);
}

console.log(
  'MAP-064 phase-one rollout regression passed (enum widened only after RPC + table ingress hardening).',
);

resetToPreMap064('resetting the local database to the last pre-MAP-064 schema');
containerName = findDatabaseContainer();

const before = snapshotLegacyGraph(containerName);

const legacyCount = Number(
  runPsql(containerName, `select pg_catalog.count(*) from public.map_entities;`),
);
if (!Number.isInteger(legacyCount) || legacyCount <= 0) {
  fail(`expected historical map entities before migration, found ${legacyCount}`);
}

runCommand(
  NPX_COMMAND,
  ['--no-install', 'supabase', 'migration', 'up', '--local'],
  'applying MAP-064 migrations over the historical schema',
);

const after = snapshotLegacyGraph(containerName);
if (after !== before) {
  fail('legacy entity/relations graph changed while adding mission/hazard support');
}

const contract = JSON.parse(
  runPsql(
    containerName,
    `select pg_catalog.jsonb_build_object(
       'entity_types', (
         select pg_catalog.jsonb_agg(enumlabel order by enumsortorder)
         from pg_catalog.pg_enum
         where enumtypid = 'public.entity_type'::pg_catalog.regtype
       ),
       'legacy_lifecycle_rows', (
         select pg_catalog.count(*)
         from public.map_entities
         where lifecycle_status is not null
       ),
       'legacy_new_types', (
         select pg_catalog.count(*)
         from public.map_entities
         where entity_type in ('mission'::public.entity_type, 'hazard'::public.entity_type)
       ),
       'lifecycle_column', exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'map_entities'
           and column_name = 'lifecycle_status'
       )
     )::text;`,
  ),
);

if (
  JSON.stringify(contract.entity_types) !==
  JSON.stringify(['character', 'location', 'mission', 'hazard'])
) {
  fail(`unexpected entity_type enum after upgrade: ${JSON.stringify(contract.entity_types)}`);
}
if (Number(contract.legacy_lifecycle_rows) !== 0) {
  fail(`historical entities received lifecycle values: ${contract.legacy_lifecycle_rows}`);
}
if (Number(contract.legacy_new_types) !== 0) {
  fail(`historical entities were reclassified as mission/hazard: ${contract.legacy_new_types}`);
}
if (contract.lifecycle_column !== true) {
  fail('lifecycle_status column is missing after upgrade');
}

console.log(
  `MAP-064 upgrade regression passed (${legacyCount} historical entities preserved exactly; no reclassification or lifecycle backfill).`,
);
