import { spawnSync } from 'node:child_process';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const NPX_COMMAND = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const PRE_MAP063_VERSION = '20260830181500';
const NOTE_IDS = ['note-demo-harbor-overview', 'note-demo-pass-travel'];

function fail(message) {
  throw new Error(`MAP-063 public-note upgrade verification failed: ${message}`);
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

function parseJsonLines(output, description) {
  try {
    return output
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    fail(`${description} returned invalid JSON: ${error instanceof Error ? error.message : error}`);
  }
}

function fetchSnapshots(containerName) {
  const output = runPsql(
    containerName,
    `select pg_catalog.jsonb_build_object(
       'id', note.id,
       'slug', note.slug,
       'entity_id', note.entity_id,
       'campaign_id', note.campaign_id,
       'title', note.title,
       'body', note.body,
       'sort_order', note.sort_order,
       'publication_status', note.publication_status::text,
       'published_at', note.published_at,
       'archived_at', note.archived_at,
       'created_at', note.created_at,
       'updated_at', note.updated_at,
       'tags', pg_catalog.coalesce((
         select pg_catalog.jsonb_agg(note_tag.tag_id order by note_tag.tag_id)
         from public.public_note_tags as note_tag
         where note_tag.note_id = note.id
       ), '[]'::jsonb)
     )::text
     from public.public_notes as note
     where note.id in ('${NOTE_IDS.join("','")}')
     order by note.id;`,
  );

  return parseJsonLines(output, 'public-note snapshot');
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
    PRE_MAP063_VERSION,
    '--no-seed',
  ],
  'resetting the local database to the last pre-MAP-063 schema',
);

const containerName = findDatabaseContainer();

runPsql(
  containerName,
  `update public.public_notes
   set created_at = '2025-01-02T03:04:05+00'::timestamptz
   where id = 'note-demo-harbor-overview';

   update public.public_notes
   set created_at = '2025-02-03T04:05:06+00'::timestamptz
   where id = 'note-demo-pass-travel';

   update public.map_entities
   set publication_status = 'archived'::public.publication_status
   where id = 'place-demo-harbor';

   update public.map_entities
   set publication_status = 'draft'::public.publication_status
   where id = 'place-demo-pass';

   do $$
   begin
     if not exists (
       select 1
       from public.public_notes as note
       join public.map_entities as entity on entity.id = note.entity_id
       where note.id = 'note-demo-harbor-overview'
         and note.publication_status = 'published'::public.publication_status
         and entity.publication_status = 'archived'::public.publication_status
         and note.created_at is distinct from note.updated_at
     ) then
       raise exception 'archived-parent historical note fixture was not established';
     end if;

     if not exists (
       select 1
       from public.public_notes as note
       join public.map_entities as entity on entity.id = note.entity_id
       where note.id = 'note-demo-pass-travel'
         and note.publication_status = 'published'::public.publication_status
         and entity.publication_status = 'draft'::public.publication_status
         and note.created_at is distinct from note.updated_at
     ) then
       raise exception 'draft-parent historical note fixture was not established';
     end if;
   end;
   $$;`,
);

const beforeSnapshots = fetchSnapshots(containerName);
if (beforeSnapshots.length !== NOTE_IDS.length) {
  fail(`expected ${NOTE_IDS.length} historical notes before migration, found ${beforeSnapshots.length}`);
}

runCommand(
  NPX_COMMAND,
  ['--no-install', 'supabase', 'migration', 'up', '--local'],
  'applying MAP-063 migrations to hidden historical notes',
);

const afterSnapshots = fetchSnapshots(containerName);
if (JSON.stringify(afterSnapshots) !== JSON.stringify(beforeSnapshots)) {
  fail(
    `historical note data changed across migration\nbefore=${JSON.stringify(beforeSnapshots)}\nafter=${JSON.stringify(afterSnapshots)}`,
  );
}

const authorRows = parseJsonLines(
  runPsql(
    containerName,
    `select pg_catalog.jsonb_build_object(
       'id', note.id,
       'author_kind', note.author_kind::text,
       'author_player_id', note.author_player_id,
       'last_modifier_kind', note.last_modifier_kind::text,
       'last_modifier_player_id', note.last_modifier_player_id,
       'parent_status', entity.publication_status::text
     )::text
     from public.public_notes as note
     join public.map_entities as entity on entity.id = note.entity_id
     where note.id in ('${NOTE_IDS.join("','")}')
     order by note.id;`,
  ),
  'author metadata snapshot',
);

const expectedParentStatus = new Map([
  ['note-demo-harbor-overview', 'archived'],
  ['note-demo-pass-travel', 'draft'],
]);

for (const row of authorRows) {
  if (
    row.author_kind !== 'master' ||
    row.author_player_id !== null ||
    row.last_modifier_kind !== 'master' ||
    row.last_modifier_player_id !== null ||
    row.parent_status !== expectedParentStatus.get(row.id)
  ) {
    fail(`unexpected migrated authorship or parent state: ${JSON.stringify(row)}`);
  }
}

const triggerState = JSON.parse(
  runPsql(
    containerName,
    `select pg_catalog.jsonb_build_object(
       'validation_restored', exists (
         select 1
         from pg_catalog.pg_trigger as trigger
         join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
         join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
         join pg_catalog.pg_proc as function on function.oid = trigger.tgfoid
         join pg_catalog.pg_namespace as function_namespace on function_namespace.oid = function.pronamespace
         where namespace.nspname = 'public'
           and relation.relname = 'public_notes'
           and trigger.tgname = '20_validate_public_note'
           and trigger.tgenabled = 'O'
           and not trigger.tgisinternal
           and function_namespace.nspname = 'private'
           and function.proname = 'validate_public_note'
       ),
       'updated_at_restored', exists (
         select 1
         from pg_catalog.pg_trigger as trigger
         join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
         join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
         join pg_catalog.pg_proc as function on function.oid = trigger.tgfoid
         join pg_catalog.pg_namespace as function_namespace on function_namespace.oid = function.pronamespace
         where namespace.nspname = 'public'
           and relation.relname = 'public_notes'
           and trigger.tgname = '90_public_note_updated_at'
           and trigger.tgenabled = 'O'
           and not trigger.tgisinternal
           and function_namespace.nspname = 'private'
           and function.proname = 'set_updated_at'
       ),
       'validation_helper_removed', pg_catalog.to_regprocedure(
         'private.validate_public_note_during_map063_backfill()'
       ) is null,
       'timestamp_helper_removed', pg_catalog.to_regprocedure(
         'private.set_public_note_updated_at_during_map063_backfill()'
       ) is null
     )::text;`,
  ),
);

if (Object.values(triggerState).some((value) => value !== true)) {
  fail(`runtime trigger restoration is incomplete: ${JSON.stringify(triggerState)}`);
}

runPsql(
  containerName,
  `do $$
   declare
     blocked boolean := false;
   begin
     begin
       update public.public_notes
       set body = body || ' forbidden-runtime-update'
       where id = 'note-demo-harbor-overview';
     exception
       when sqlstate '23514' then
         if sqlerrm <> 'a published note requires a published entity' then
           raise;
         end if;
         blocked := true;
     end;

     if not blocked then
       raise exception 'standard public-note validator did not resume after MAP-063';
     end if;
   end;
   $$;`,
);

console.log(
  'MAP-063 public-note upgrade regression passed (archived/draft parents, exact preservation, trigger restoration).',
);
