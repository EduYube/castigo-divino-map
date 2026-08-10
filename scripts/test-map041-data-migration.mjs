import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const MIGRATION_PATH = 'supabase/migrations/20260810170000_add_geographic_search_extents.sql';

function fail(message) {
  throw new Error(`MAP-041 data migration verification failed: ${message}`);
}

function psql(sql) {
  return spawnSync(
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
}

function runPsql(sql) {
  const result = psql(sql);
  if (result.error) fail(`Unable to run psql: ${result.error.message}`);
  if (result.status !== 0) {
    fail(result.stderr.trim() || `psql exited with ${String(result.status)}.`);
  }
  return result.stdout.trim();
}

function expectPsqlFailure(sql, expectedMessage) {
  const result = psql(sql);
  if (result.error) fail(`Unable to run psql: ${result.error.message}`);
  if (result.status === 0) fail('semantic conflict unexpectedly succeeded.');
  const diagnostic = `${result.stdout}\n${result.stderr}`;
  if (!diagnostic.includes(expectedMessage)) {
    fail(`semantic conflict failed for the wrong reason: ${diagnostic.trim()}`);
  }
}

const migrationSql = await readFile(MIGRATION_PATH, 'utf8');
const stateQuery = String.raw`
select md5(jsonb_agg(jsonb_build_object(
  'id', id,
  'minX', search_min_x,
  'maxX', search_max_x,
  'minY', search_min_y,
  'maxY', search_max_y
) order by id)::text)
from public.geographic_names
where search_min_x is not null;
`;

const before = runPsql(stateQuery);
if (!before) fail('published MAP-041 geographic extents are missing after db reset.');

runPsql(migrationSql);
const afterRepeatedMigration = runPsql(stateQuery);
if (afterRepeatedMigration !== before) {
  fail('re-executing MAP-041 changed already persisted extents.');
}

expectPsqlFailure(
  `begin;\n` +
    `update public.geographic_names set search_min_x = 1390 where id = 'geo-sword-coast';\n` +
    `${migrationSql}\nrollback;`,
  'MAP-041 semantic conflict: identity geo-sword-coast already has different search bounds',
);

const afterConflict = runPsql(stateQuery);
if (afterConflict !== before) {
  fail('the failed semantic-conflict test changed persisted extents.');
}

console.log(`Verified MAP-041 repeated migration and fail-closed semantic conflict (${before}).`);
