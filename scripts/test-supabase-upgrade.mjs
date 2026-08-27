import { spawnSync } from 'node:child_process';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const NPX_COMMAND = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const MAP014_VERSION = '20260805150000';

function fail(message) {
  throw new Error(`Supabase upgrade verification failed: ${message}`);
}

function runCommand(command, argumentsList, description) {
  const result = spawnSync(command, argumentsList, {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    fail(`${description}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(`${description} exited with status ${result.status ?? 'unknown'}`);
  }
}

function findDatabaseContainer() {
  const result = spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.error) {
    fail(`Docker could not be executed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(result.stderr.trim() || `docker ps exited with status ${result.status ?? 'unknown'}`);
  }

  const runningContainers = result.stdout.split(/\r?\n/u).filter(Boolean);
  if (!runningContainers.includes(DATABASE_CONTAINER)) {
    fail(
      `Expected running local database container ${DATABASE_CONTAINER}; found ${
        runningContainers.join(', ') || 'none'
      }.`,
    );
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
    {
      encoding: 'utf8',
      windowsHide: true,
    },
  );

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    fail(`Unable to run psql: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(result.stderr.trim() || `psql exited with status ${result.status ?? 'unknown'}`);
  }

  return result.stdout.trim();
}

runCommand(
  NPX_COMMAND,
  ['--no-install', 'supabase', 'db', 'reset', '--local', '--version', MAP014_VERSION, '--no-seed'],
  'resetting the local database to the MAP-014 schema',
);

const containerName = findDatabaseContainer();

runPsql(
  containerName,
  `insert into public.categories (
     id,
     slug,
     name,
     publication_status
   ) values (
     'category-upgrade-legacy',
     'upgrade-legacy',
     'Upgrade Legacy Category',
     'published'
   );

   insert into public.map_entities (
     id,
     slug,
     entity_type,
     disposition,
     name,
     normalized_name,
     x,
     y,
     category_id,
     publication_status
   ) values
     (
       'entity-upgrade-legacy-character',
       'upgrade-legacy-character',
       'character',
       'ally',
       'Upgrade Legacy Character',
       'upgrade legacy character',
       1200,
       800,
       'category-upgrade-legacy',
       'published'
     ),
     (
       'entity-upgrade-legacy-location',
       'upgrade-legacy-location',
       'location',
       'unknown',
       'Upgrade Legacy Location',
       'upgrade legacy location',
       1300,
       900,
       'category-upgrade-legacy',
       'published'
     ),
     (
       'entity-skade',
       'skade',
       'character',
       'unknown',
       'Skade',
       'skade',
       800,
       700,
       'category-upgrade-legacy',
       'published'
     ),
     (
       'entity-ura',
       'ura',
       'character',
       'unknown',
       'Ura',
       'ura',
       900,
       700,
       'category-upgrade-legacy',
       'published'
     ),
     (
       'entity-request-07d26371bbff42d9b91e076d099891b0',
       'request-07d26371bbff42d9b91e076d099891b0',
       'character',
       'unknown',
       'Veyra',
       'veyra',
       1000,
       700,
       'category-upgrade-legacy',
       'published'
     );

   insert into public.geographic_names (
     id,
     slug,
     name,
     normalized_name,
     aliases,
     language,
     x,
     y,
     entity_id,
     publication_status
   ) values (
     'geo-upgrade-legacy-crossing',
     'upgrade-legacy-crossing',
     'Upgrade Legacy Crossing',
     'upgrade legacy crossing',
     array['Legacy Crossing', 'Old Ford'],
     'en',
     1300,
     900,
     'entity-upgrade-legacy-location',
     'published'
   );

   insert into public.character_locations (
     id,
     character_id,
     location_id,
     label,
     sort_order,
     publication_status
   ) values (
     'relation-upgrade-legacy-location',
     'entity-upgrade-legacy-character',
     'entity-upgrade-legacy-location',
     'Legacy known location',
     0,
     'published'
   );

   do $$
   begin
     if (
       select disposition::text
       from public.map_entities
       where id = 'entity-upgrade-legacy-character'
     ) <> 'ally' then
       raise exception 'legacy fixture did not preserve its global ally disposition';
     end if;
   end;
   $$;`,
);

runCommand(
  NPX_COMMAND,
  ['--no-install', 'supabase', 'migration', 'up', '--local'],
  'applying the MAP-015 migrations to the legacy fixture',
);

runPsql(
  containerName,
  `insert into public.players (
     id,
     slug,
     display_name,
     publication_status
   ) values (
     'player-upgrade-perspective',
     'upgrade-perspective',
     'Upgrade Perspective',
     'published'
   );

   do $$
   begin
     if to_regclass('public.character_locations') is not null then
       raise exception 'legacy character_locations survived the upgrade';
     end if;

     if to_regtype('public.disposition') is not null then
       raise exception 'legacy disposition enum survived the upgrade';
     end if;

     if exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'map_entities'
         and column_name = 'disposition'
     ) then
       raise exception 'legacy global disposition column survived the upgrade';
     end if;

     if (
       select count(*)
       from public.entity_player_dispositions
       where player_id = 'player-upgrade-perspective'
         and entity_id in (
           'entity-upgrade-legacy-character',
           'entity-upgrade-legacy-location'
         )
         and disposition = 'neutral'
     ) <> 2 then
       raise exception 'legacy global dispositions were not reset explicitly to neutral';
     end if;

     if (
       select count(*)
       from public.geographic_name_aliases
       where geographic_name_id = 'geo-upgrade-legacy-crossing'
         and normalized_value in ('legacy crossing', 'old ford')
         and publication_status = 'published'
     ) <> 2 then
       raise exception 'legacy geographic aliases were not backfilled correctly';
     end if;

     if not exists (
       select 1
       from public.character_location_events
       where id = 'relation-upgrade-legacy-location'
         and character_id = 'entity-upgrade-legacy-character'
         and event_type = 'sighting'
         and location_entity_id = 'entity-upgrade-legacy-location'
         and publication_status = 'published'
     ) then
       raise exception 'legacy character location was not backfilled as a sighting';
     end if;

     if (
       select count(*)
       from private.reserved_public_identifiers as reservation
       join public.geographic_name_aliases as alias
         on alias.id = reservation.value
       where reservation.namespace = 'geographic_name_alias_id'
         and alias.geographic_name_id = 'geo-upgrade-legacy-crossing'
     ) <> 2 then
       raise exception 'published geographic alias identifiers were not reserved';
     end if;

     if not exists (
       select 1
       from private.reserved_public_identifiers
       where namespace = 'character_location_event_id'
         and value = 'relation-upgrade-legacy-location'
     ) then
       raise exception 'published character event identifier was not reserved';
     end if;

     if exists (
       select 1
       from public.map_entities as entity
       cross join public.players as player
       left join public.entity_player_dispositions as relation
         on relation.entity_id = entity.id
         and relation.player_id = player.id
       where relation.entity_id is null
     ) then
       raise exception 'entity-player matrix is incomplete after the upgrade';
     end if;
   end;
   $$;

   select 'ok - MAP-014 legacy aliases, events and identifiers upgraded' as result
   union all
   select 'ok - global legacy disposition policy resets new perspectives to neutral'
   union all
   select 'ok - entity-player matrix remains complete after the upgrade';`,
);

console.log('Supabase upgrade verification passed: MAP-014 fixture upgraded through MAP-015.');
