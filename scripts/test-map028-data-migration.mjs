import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const MIGRATION_PATH = 'supabase/migrations/20260808203000_migrate_beta01_public_catalog.sql';
const ROLLBACK_PATH = 'supabase/rollback/map-028_archive_beta01_catalog.sql';

function fail(message) {
  throw new Error(`MAP-028 data migration verification failed: ${message}`);
}

function runPsql(sql) {
  const result = spawnSync(
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
    { input: sql, encoding: 'utf8', windowsHide: true },
  );

  if (result.error) fail(`Unable to run psql: ${result.error.message}`);
  if (result.status !== 0)
    fail(result.stderr.trim() || `psql exited with ${String(result.status)}.`);
  return result.stdout.trim();
}

const stateQuery = String.raw`
with migrated_rows as (
  select 'categories' as relation, id as identity, to_jsonb(row_value) as payload
  from public.categories as row_value
  where id in ('category-settlement', 'category-landmark')
  union all
  select 'tags', id, to_jsonb(row_value)
  from public.tags as row_value
  where id in ('coastal', 'demo-data', 'mountain-pass', 'trade-route')
  union all
  select 'map_entities', id, to_jsonb(row_value)
  from public.map_entities as row_value
  where id in ('place-demo-harbor', 'place-demo-pass')
  union all
  select 'entity_aliases', id, to_jsonb(row_value)
  from public.entity_aliases as row_value
  where id in ('alias-demo-harbor-puerto-ejemplo', 'alias-demo-pass-desfiladero-ejemplo')
  union all
  select 'entity_tags', id, to_jsonb(row_value)
  from public.entity_tags as row_value
  where id like 'entity-tag-demo-%'
  union all
  select 'public_notes', id, to_jsonb(row_value)
  from public.public_notes as row_value
  where id in ('note-demo-harbor-overview', 'note-demo-pass-travel')
  union all
  select 'public_note_tags', id, to_jsonb(row_value)
  from public.public_note_tags as row_value
  where id like 'note-tag-demo-%'
)
select md5(jsonb_agg(payload order by relation, identity)::text)
from migrated_rows;
`;

const publicCountQuery = String.raw`
select
  (select count(*) from public.categories where id in ('category-settlement', 'category-landmark') and publication_status = 'published')
  + (select count(*) from public.tags where id in ('coastal', 'demo-data', 'mountain-pass', 'trade-route') and publication_status = 'published')
  + (select count(*) from public.map_entities where id in ('place-demo-harbor', 'place-demo-pass') and publication_status = 'published')
  + (select count(*) from public.entity_aliases where id in ('alias-demo-harbor-puerto-ejemplo', 'alias-demo-pass-desfiladero-ejemplo') and publication_status = 'published')
  + (select count(*) from public.entity_tags where id like 'entity-tag-demo-%' and publication_status = 'published')
  + (select count(*) from public.public_notes where id in ('note-demo-harbor-overview', 'note-demo-pass-travel') and publication_status = 'published')
  + (select count(*) from public.public_note_tags where id like 'note-tag-demo-%' and publication_status = 'published');
`;

const migrationSql = await readFile(MIGRATION_PATH, 'utf8');
const rollbackSql = await readFile(ROLLBACK_PATH, 'utf8');

const before = runPsql(stateQuery);
if (!before) fail('the migrated catalog is missing after db reset.');

runPsql(migrationSql);
const afterRepeatedMigration = runPsql(stateQuery);
if (afterRepeatedMigration !== before) {
  fail('a repeated migration changed already migrated rows.');
}

const rollbackPublishedCount = runPsql(`begin;\n${rollbackSql}\n${publicCountQuery}\nrollback;`);
if (rollbackPublishedCount !== '0') {
  fail(`rollback left ${rollbackPublishedCount} migrated public rows visible.`);
}

const afterRollbackTest = runPsql(stateQuery);
if (afterRollbackTest !== before) {
  fail('the transactional rollback test did not restore the pre-test state.');
}

console.log(
  `Verified MAP-028 repeated migration and rollback without changing persisted test state (${before}).`,
);
