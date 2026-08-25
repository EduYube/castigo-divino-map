import { spawnSync } from 'node:child_process';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const NPX_COMMAND = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const V1_BASELINE_VERSION = '20260811213000';
const INITIAL_CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';

function fail(message) {
  throw new Error(`MAP-053 v1.0 upgrade rehearsal failed: ${message}`);
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
  [
    '--no-install',
    'supabase',
    'db',
    'reset',
    '--local',
    '--version',
    V1_BASELINE_VERSION,
    '--no-seed',
  ],
  'resetting the local database to the exact v1.0 baseline',
);

const containerName = findDatabaseContainer();

runPsql(
  containerName,
  `insert into auth.users (id, email, raw_user_meta_data)
   values (
     '00000000-0000-4000-8000-0000000000a1',
     'map053-upgrade-moderator@example.invalid',
     '{}'::jsonb
   );

   insert into public.categories (
     id, slug, name, description, publication_status,
     published_at, created_at, updated_at
   ) values (
     'category-map053-upgrade',
     'map053-upgrade',
     'MAP053 Upgrade Category',
     'Exact v1.0 upgrade fixture',
     'published',
     '2026-07-01T00:00:00Z',
     '2026-06-01T00:00:00Z',
     '2026-07-02T00:00:00Z'
   );

   insert into public.tags (
     id, name, description, publication_status,
     published_at, created_at, updated_at
   ) values (
     'map053-upgrade-tag',
     'MAP053 Upgrade Tag',
     'Exact v1.0 upgrade fixture',
     'published',
     '2026-07-01T00:01:00Z',
     '2026-06-01T00:01:00Z',
     '2026-07-02T00:01:00Z'
   );

   insert into public.players (
     id, slug, display_name, name_language, publication_status,
     published_at, created_at, updated_at
   ) values (
     'player-map053-upgrade',
     'map053-upgrade-player',
     'MAP053 Upgrade Player',
     'en',
     'published',
     '2026-07-01T00:02:00Z',
     '2026-06-01T00:02:00Z',
     '2026-07-02T00:02:00Z'
   );

   insert into public.map_entities (
     id, slug, entity_type, visibility, audience, portrait_path,
     name_language, name, summary, description, x, y, category_id,
     publication_status, published_at, created_at, updated_at
   ) values
     (
       'entity-map053-upgrade-character',
       'map053-upgrade-character',
       'character',
       'pin',
       'public',
       'portraits/11111111-1111-4111-8111-111111111111.png',
       'en',
       'MAP053 Upgrade Character',
       'Public v1.0 fixture character',
       'Must survive MAP-053 without identity or portrait changes.',
       1200,
       800,
       'category-map053-upgrade',
       'published',
       '2026-07-01T00:03:00Z',
       '2026-06-01T00:03:00Z',
       '2026-07-02T00:03:00Z'
     ),
     (
       'entity-map053-upgrade-location',
       'map053-upgrade-location',
       'location',
       'search_only',
       'master',
       null,
       'en',
       'MAP053 Upgrade Master Location',
       'Master-only v1.0 fixture location',
       'Must remain master-only after MAP-053.',
       1300,
       900,
       'category-map053-upgrade',
       'published',
       '2026-07-01T00:04:00Z',
       '2026-06-01T00:04:00Z',
       '2026-07-02T00:04:00Z'
     );

   update public.entity_player_dispositions
   set disposition = case entity_id
     when 'entity-map053-upgrade-character' then 'ally'::public.player_disposition
     else 'enemy'::public.player_disposition
   end,
   updated_at = '2026-07-02T00:05:00Z'
   where player_id = 'player-map053-upgrade'
     and entity_id in (
       'entity-map053-upgrade-character',
       'entity-map053-upgrade-location'
     );

   insert into public.entity_aliases (
     id, entity_id, language, value, publication_status,
     published_at, created_at, updated_at
   ) values (
     'alias-map053-upgrade-character',
     'entity-map053-upgrade-character',
     'en',
     'MAP053 Legacy Alias',
     'published',
     '2026-07-01T00:06:00Z',
     '2026-06-01T00:06:00Z',
     '2026-07-02T00:06:00Z'
   );

   insert into public.entity_tags (
     id, entity_id, tag_id, publication_status,
     published_at, created_at, updated_at
   ) values (
     'entity-tag-map053-upgrade',
     'entity-map053-upgrade-character',
     'map053-upgrade-tag',
     'published',
     '2026-07-01T00:07:00Z',
     '2026-06-01T00:07:00Z',
     '2026-07-02T00:07:00Z'
   );

   insert into public.public_notes (
     id, slug, entity_id, title, body, sort_order, publication_status,
     published_at, created_at, updated_at
   ) values (
     'note-map053-upgrade',
     'map053-upgrade-note',
     'entity-map053-upgrade-character',
     'MAP053 Upgrade Note',
     'Legacy note body that must survive unchanged.',
     3,
     'published',
     '2026-07-01T00:08:00Z',
     '2026-06-01T00:08:00Z',
     '2026-07-02T00:08:00Z'
   );

   insert into public.public_note_tags (
     id, note_id, tag_id, publication_status,
     published_at, created_at, updated_at
   ) values (
     'note-tag-map053-upgrade',
     'note-map053-upgrade',
     'map053-upgrade-tag',
     'published',
     '2026-07-01T00:09:00Z',
     '2026-06-01T00:09:00Z',
     '2026-07-02T00:09:00Z'
   );

   insert into public.geographic_names (
     id, slug, name, language, x, y, recommended_zoom, entity_id,
     publication_status, published_at, created_at, updated_at
   ) values (
     'geo-map053-upgrade-location',
     'map053-upgrade-geography',
     'MAP053 Upgrade Geography',
     'en',
     1300,
     900,
     0.75,
     'entity-map053-upgrade-location',
     'published',
     '2026-07-01T00:10:00Z',
     '2026-06-01T00:10:00Z',
     '2026-07-02T00:10:00Z'
   );

   insert into public.geographic_name_aliases (
     id, geographic_name_id, language, value, publication_status,
     published_at, created_at, updated_at
   ) values (
     'geo-alias-map053-upgrade',
     'geo-map053-upgrade-location',
     'en',
     'MAP053 Legacy Geography Alias',
     'published',
     '2026-07-01T00:11:00Z',
     '2026-06-01T00:11:00Z',
     '2026-07-02T00:11:00Z'
   );

   insert into public.character_location_relations (
     character_id, location_id, relation_status, publication_status,
     published_at, created_at, updated_at
   ) values (
     'entity-map053-upgrade-character',
     'entity-map053-upgrade-location',
     'associated',
     'published',
     '2026-07-01T00:12:00Z',
     '2026-06-01T00:12:00Z',
     '2026-07-02T00:12:00Z'
   );

   insert into public.character_location_events (
     id, character_id, event_type, location_entity_id, geographic_name_id,
     location_label, summary, language, observed_at, publication_status,
     published_at, created_at, updated_at
   ) values (
     'location-event-map053-upgrade',
     'entity-map053-upgrade-character',
     'sighting',
     'entity-map053-upgrade-location',
     'geo-map053-upgrade-location',
     'MAP053 Legacy Location',
     'Legacy sighting that must survive unchanged.',
     'en',
     '2026-06-15T12:30:00Z',
     'published',
     '2026-07-01T00:13:00Z',
     '2026-06-01T00:13:00Z',
     '2026-07-02T00:13:00Z'
   );

   insert into public.public_requests (
     id, sender_name, proposed_name, entity_type, x, y, description, reason,
     request_status, moderator_user_id, moderation_note, converted_entity_id,
     moderated_at, created_at, updated_at
   ) values (
     '20000000-0000-4000-8000-000000000053',
     'MAP053 Legacy Visitor',
     'MAP053 Legacy Proposed Location',
     'location',
     1300,
     900,
     'Legacy request description.',
     'Legacy request reason.',
     'converted',
     '00000000-0000-4000-8000-0000000000a1',
     'Legacy moderation note.',
     'entity-map053-upgrade-location',
     '2026-07-03T10:00:00Z',
     '2026-06-02T10:00:00Z',
     '2026-07-03T10:01:00Z'
   );

   do $$
   begin
     if to_regclass('public.campaigns') is not null then
       raise exception 'fixture was not created on the v1.0 baseline';
     end if;

     if (
       select portrait_path
       from public.map_entities
       where id = 'entity-map053-upgrade-character'
     ) <> 'portraits/11111111-1111-4111-8111-111111111111.png' then
       raise exception 'v1.0 portrait fixture was not established';
     end if;

     if (
       select audience::text
       from public.map_entities
       where id = 'entity-map053-upgrade-location'
     ) <> 'master' then
       raise exception 'v1.0 master fixture was not established';
     end if;
   end;
   $$;`,
);

runCommand(
  NPX_COMMAND,
  ['--no-install', 'supabase', 'migration', 'up', '--local'],
  'applying MAP-053 to the exact v1.0 fixture',
);

runPsql(
  containerName,
  `do $$
   declare
     initial_campaign uuid := '${INITIAL_CAMPAIGN_ID}'::uuid;
   begin
     if not exists (
       select 1
       from public.campaigns
       where id = initial_campaign
         and slug = 'castigo-divino'
         and status = 'active'
     ) then
       raise exception 'deterministic initial campaign was not created';
     end if;

     if exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'geographic_names'
         and column_name = 'campaign_id'
     ) then
       raise exception 'global geographic index was incorrectly campaign-scoped';
     end if;

     if (
       select count(*)
       from public.map_entities
       where id in ('entity-map053-upgrade-character', 'entity-map053-upgrade-location')
         and campaign_id = initial_campaign
     ) <> 2 then
       raise exception 'v1.0 entities were not assigned exactly once to the initial campaign';
     end if;

     if not exists (
       select 1
       from public.map_entities
       where id = 'entity-map053-upgrade-character'
         and slug = 'map053-upgrade-character'
         and name = 'MAP053 Upgrade Character'
         and x = 1200
         and y = 800
         and category_id = 'category-map053-upgrade'
         and portrait_path = 'portraits/11111111-1111-4111-8111-111111111111.png'
         and audience = 'public'
         and publication_status = 'published'
         and created_at = '2026-06-01T00:03:00Z'::timestamptz
         and updated_at = '2026-07-02T00:03:00Z'::timestamptz
     ) then
       raise exception 'public character identity/content/portrait/timestamps changed during migration';
     end if;

     if not exists (
       select 1
       from public.map_entities
       where id = 'entity-map053-upgrade-location'
         and slug = 'map053-upgrade-location'
         and audience = 'master'
         and publication_status = 'published'
         and campaign_id = initial_campaign
         and created_at = '2026-06-01T00:04:00Z'::timestamptz
         and updated_at = '2026-07-02T00:04:00Z'::timestamptz
     ) then
       raise exception 'master entity boundary or history changed during migration';
     end if;

     if not exists (
       select 1
       from public.categories
       where id = 'category-map053-upgrade'
         and slug = 'map053-upgrade'
         and campaign_id = initial_campaign
         and created_at = '2026-06-01T00:00:00Z'::timestamptz
         and updated_at = '2026-07-02T00:00:00Z'::timestamptz
     ) then
       raise exception 'category identity or timestamps changed during migration';
     end if;

     if not exists (
       select 1
       from public.players
       where id = 'player-map053-upgrade'
         and slug = 'map053-upgrade-player'
         and campaign_id = initial_campaign
     ) then
       raise exception 'player identity was not preserved in the initial campaign';
     end if;

     if not exists (
       select 1
       from public.entity_aliases
       where id = 'alias-map053-upgrade-character'
         and entity_id = 'entity-map053-upgrade-character'
         and value = 'MAP053 Legacy Alias'
         and campaign_id = initial_campaign
     ) then
       raise exception 'entity alias was lost or rewritten';
     end if;

     if not exists (
       select 1
       from public.entity_tags
       where id = 'entity-tag-map053-upgrade'
         and entity_id = 'entity-map053-upgrade-character'
         and tag_id = 'map053-upgrade-tag'
         and campaign_id = initial_campaign
     ) then
       raise exception 'entity tag relationship was lost';
     end if;

     if not exists (
       select 1
       from public.public_notes
       where id = 'note-map053-upgrade'
         and slug = 'map053-upgrade-note'
         and entity_id = 'entity-map053-upgrade-character'
         and body = 'Legacy note body that must survive unchanged.'
         and sort_order = 3
         and campaign_id = initial_campaign
     ) then
       raise exception 'note identity/content was lost';
     end if;

     if not exists (
       select 1
       from public.public_note_tags
       where id = 'note-tag-map053-upgrade'
         and note_id = 'note-map053-upgrade'
         and tag_id = 'map053-upgrade-tag'
         and campaign_id = initial_campaign
     ) then
       raise exception 'note tag relationship was lost';
     end if;

     if (
       select entity_id
       from public.geographic_names
       where id = 'geo-map053-upgrade-location'
     ) is not null then
       raise exception 'legacy geographic entity pointer was not removed from the global index';
     end if;

     if not exists (
       select 1
       from public.geographic_names
       where id = 'geo-map053-upgrade-location'
         and slug = 'map053-upgrade-geography'
         and name = 'MAP053 Upgrade Geography'
         and x = 1300
         and y = 900
         and created_at = '2026-06-01T00:10:00Z'::timestamptz
         and updated_at = '2026-07-02T00:10:00Z'::timestamptz
     ) then
       raise exception 'global geographic content or timestamps changed';
     end if;

     if not exists (
       select 1
       from public.campaign_geographic_entity_links
       where campaign_id = initial_campaign
         and geographic_name_id = 'geo-map053-upgrade-location'
         and entity_id = 'entity-map053-upgrade-location'
         and created_at = '2026-06-01T00:10:00Z'::timestamptz
         and updated_at = '2026-07-02T00:10:00Z'::timestamptz
     ) then
       raise exception 'legacy geographic association was not preserved in the campaign link';
     end if;

     if not exists (
       select 1
       from public.geographic_name_aliases
       where id = 'geo-alias-map053-upgrade'
         and geographic_name_id = 'geo-map053-upgrade-location'
         and value = 'MAP053 Legacy Geography Alias'
     ) then
       raise exception 'geographic alias was lost';
     end if;

     if not exists (
       select 1
       from public.character_location_relations
       where character_id = 'entity-map053-upgrade-character'
         and location_id = 'entity-map053-upgrade-location'
         and relation_status = 'associated'
         and campaign_id = initial_campaign
         and created_at = '2026-06-01T00:12:00Z'::timestamptz
         and updated_at = '2026-07-02T00:12:00Z'::timestamptz
     ) then
       raise exception 'character-location relation or history was lost';
     end if;

     if not exists (
       select 1
       from public.character_location_events
       where id = 'location-event-map053-upgrade'
         and character_id = 'entity-map053-upgrade-character'
         and location_entity_id = 'entity-map053-upgrade-location'
         and geographic_name_id = 'geo-map053-upgrade-location'
         and observed_at = '2026-06-15T12:30:00Z'::timestamptz
         and campaign_id = initial_campaign
     ) then
       raise exception 'character location event was lost or re-scoped incorrectly';
     end if;

     if not exists (
       select 1
       from public.entity_player_dispositions
       where entity_id = 'entity-map053-upgrade-character'
         and player_id = 'player-map053-upgrade'
         and disposition = 'ally'
         and campaign_id = initial_campaign
     ) or not exists (
       select 1
       from public.entity_player_dispositions
       where entity_id = 'entity-map053-upgrade-location'
         and player_id = 'player-map053-upgrade'
         and disposition = 'enemy'
         and campaign_id = initial_campaign
     ) then
       raise exception 'per-player dispositions were not preserved';
     end if;

     if not exists (
       select 1
       from public.public_requests
       where id = '20000000-0000-4000-8000-000000000053'
         and proposed_name = 'MAP053 Legacy Proposed Location'
         and request_status = 'converted'
         and moderator_user_id = '00000000-0000-4000-8000-0000000000a1'
         and moderation_note = 'Legacy moderation note.'
         and converted_entity_id = 'entity-map053-upgrade-location'
         and moderated_at = '2026-07-03T10:00:00Z'::timestamptz
         and created_at = '2026-06-02T10:00:00Z'::timestamptz
         and updated_at = '2026-07-03T10:01:00Z'::timestamptz
         and campaign_id = initial_campaign
     ) then
       raise exception 'public request moderation trace or timestamps changed';
     end if;

     if (
       select count(*)
       from public.campaign_geographic_entity_links
       where geographic_name_id = 'geo-map053-upgrade-location'
     ) <> 1 then
       raise exception 'geographic association was duplicated during migration';
     end if;
   end;
   $$;

   select 'ok - exact v1.0 baseline upgrades to deterministic initial campaign' as result
   union all
   select 'ok - IDs, slugs, portrait, audience, lifecycle and timestamps are preserved'
   union all
   select 'ok - notes, tags, dispositions, relations, events and moderation trace are preserved'
   union all
   select 'ok - global geography stays single-copy and campaign association is migrated';`,
);

console.log('MAP-053 v1.0 upgrade rehearsal passed.');
