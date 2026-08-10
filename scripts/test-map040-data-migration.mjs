import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const DATABASE_CONTAINER = 'supabase_db_castigo-divino-map';
const MIGRATION_PATH = 'supabase/migrations/20260810144500_add_spanish_geographic_aliases.sql';

function fail(message) {
  throw new Error(`MAP-040 data migration verification failed: ${message}`);
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
select md5(jsonb_agg(to_jsonb(a) order by a.id)::text)
from public.geographic_name_aliases a
where a.publication_status = 'published'::public.publication_status;
`;

const before = runPsql(stateQuery);
if (!before) fail('published geographic aliases are missing after db reset.');

runPsql(migrationSql);
const afterRepeatedMigration = runPsql(stateQuery);
if (afterRepeatedMigration !== before) {
  fail('re-executing MAP-040 changed already persisted aliases.');
}

expectPsqlFailure(
  `begin;\n` +
    `delete from public.geographic_name_aliases where id = 'geo-alias-waterdeep-es';\n` +
    `insert into public.geographic_name_aliases (` +
    `id, geographic_name_id, language, value, normalized_value, publication_status, published_at` +
    `) values (` +
    `'geo-alias-waterdeep-es', 'geo-cormyr', 'es', 'Aguas Profundas', ` +
    `private.normalize_search_text('Aguas Profundas'), 'published'::public.publication_status, now()` +
    `);\n${migrationSql}\nrollback;`,
  'MAP-040 alias id geo-alias-waterdeep-es already exists with incompatible semantics',
);

const afterConflict = runPsql(stateQuery);
if (afterConflict !== before) {
  fail('the failed semantic-conflict test changed persisted aliases.');
}

console.log(`Verified MAP-040 repeated migration and fail-closed semantic conflict (${before}).`);
