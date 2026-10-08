import { spawnSync } from 'node:child_process';
import { renameSync } from 'node:fs';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const NPX_COMMAND = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const MAP014_VERSION = '20260805150000';
const MAP068_MIGRATION = new URL(
  '../supabase/migrations/20261007080000_separate_veyra_un_aliento_menos.sql',
  import.meta.url,
);
const MAP068_HIDDEN = new URL(
  '../supabase/migrations/20261007080000_separate_veyra_un_aliento_menos.sql.rehearsal-hidden',
  import.meta.url,
);

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

renameSync(MAP068_MIGRATION, MAP068_HIDDEN);
try {
  runCommand(
    NPX_COMMAND,
    ['--no-install', 'supabase', 'migration', 'up', '--local'],
    'applying migrations through the pre-MAP-068 schema to the legacy fixture',
  );
} finally {
  renameSync(MAP068_HIDDEN, MAP068_MIGRATION);
}

runPsql(
  containerName,
  `
   -- MAP-068 is deliberately fail-closed against the audited production
   -- Veyra inventory. Bring this synthetic MAP-014 upgrade fixture to that
   -- legitimate pre-MAP-068 checkpoint before applying the latest migration.
   insert into auth.users (id)
   values ('00000000-0000-4000-8000-000000000068')
   on conflict (id) do nothing;

   -- These public IDs were legitimately used earlier in the historical lineage
   -- and are now reserved. Reconstructing the audited pre-MAP-068 checkpoint is
   -- fixture setup only, matching the dedicated MAP-068 rehearsal pattern.
   alter table public.map_entities disable trigger "60_map_entity_identifier";
   alter table public.map_entities disable trigger "70_map_entity_reserve";

   insert into public.map_entities (
     campaign_id,id,slug,entity_type,visibility,audience,name,name_language,
     summary,description,x,y,category_id,publication_status
   )
   select
     '00000000-0000-4000-8000-000000000053'::uuid,
     source.id,
     'upgrade-' || source.ordinal,
     'character'::public.entity_type,
     'pin'::public.map_visibility,
     'public'::public.entity_audience,
     'Upgrade MAP-068 ' || source.ordinal,
     'en',
     '',
     'Synthetic pre-MAP-068 compatibility fixture',
     1400 + source.ordinal,
     900 + source.ordinal,
     (select category_id from public.map_entities where id='entity-request-07d26371bbff42d9b91e076d099891b0'),
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
  `,
);

runCommand(
  NPX_COMMAND,
  ['--no-install', 'supabase', 'migration', 'up', '--local'],
  'applying MAP-068 to the audited compatibility checkpoint',
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
       join public.players as player
         on player.campaign_id = entity.campaign_id
       left join public.entity_player_dispositions as relation
         on relation.entity_id = entity.id
         and relation.player_id = player.id
         and relation.campaign_id = entity.campaign_id
       where player.character_entity_id is distinct from entity.id
         and relation.entity_id is null
     ) then
       raise exception 'campaign-scoped entity-player matrix is incomplete after the upgrade';
     end if;

     if exists (
       select 1
       from public.entity_player_dispositions as relation
       join public.map_entities as entity
         on entity.id = relation.entity_id
       join public.players as player
         on player.id = relation.player_id
       where relation.campaign_id <> entity.campaign_id
          or relation.campaign_id <> player.campaign_id
     ) then
       raise exception 'entity-player matrix contains a cross-campaign disposition after the upgrade';
     end if;
   end;
   $$;

   select 'ok - MAP-014 legacy aliases, events and identifiers upgraded' as result
   union all
   select 'ok - global legacy disposition policy resets new perspectives to neutral'
   union all
   select 'ok - campaign-scoped entity-player matrix remains complete without cross-campaign rows';`,
);

console.log('Supabase upgrade verification passed: MAP-014 fixture upgraded through MAP-015.');
