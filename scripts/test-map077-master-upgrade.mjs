import { spawnSync } from 'node:child_process';

const CONTAINER = 'supabase_db_castigo-divino-map';
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(command, args, label, input) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    input,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`MAP-077 ${label}: ${result.error?.message ?? result.stderr ?? result.status}`);
  }
  return result.stdout.trim();
}

function psql(sql) {
  return run(
    'docker',
    [
      'exec',
      '--interactive',
      '--user',
      'postgres',
      CONTAINER,
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
    'psql',
    sql,
  );
}

function publicTables() {
  return psql(
    "select tablename from pg_catalog.pg_tables where schemaname='public' order by tablename;",
  )
    .split(/\r?\n/u)
    .filter(Boolean);
}

function quotedIdentifier(name) {
  return '"' + name.replaceAll('"', '""') + '"';
}

function quotedLiteral(name) {
  return "'" + name.replaceAll("'", "''") + "'";
}

function rowSnapshotSql(tables) {
  const fields = tables.map((name) => {
    const row = 'pg_catalog.to_jsonb(row_data)';
    return (
      quotedLiteral(name) +
      ', (select coalesce(pg_catalog.jsonb_agg(' +
      row +
      ' order by (' +
      row +
      ')::text), ' +
      "'[]'::jsonb) from public." +
      quotedIdentifier(name) +
      ' as row_data)'
    );
  });
  return 'select pg_catalog.jsonb_build_object(' + fields.join(',\n') + ')::text;';
}

// Only a local reset. This checkpoint is the exact latest migration in MAP-076 master.
run(
  NPX,
  [
    '--no-install',
    'supabase',
    'db',
    'reset',
    '--local',
    '--version',
    '20261021095215',
    '--no-seed',
  ],
  'reset to MAP-076 master baseline',
);

const beforeTables = publicTables();
if (
  !beforeTables.includes('map_contexts') ||
  !beforeTables.includes('entity_map_placements') ||
  beforeTables.includes('campaign_geographic_map_context_links')
) {
  throw new Error('Unexpected MAP-076 schema baseline for MAP-077 rehearsal');
}
if (psql('select count(*) from public.map_contexts;') !== '0') {
  throw new Error('Unexpected pre-MAP-077 physical map rows');
}

const compareSql = rowSnapshotSql(beforeTables.filter((table) => table !== 'map_contexts'));
const before = psql(compareSql);
run(NPX, ['--no-install', 'supabase', 'migration', 'up', '--local'], 'apply MAP-077');
const afterTables = publicTables();
const added = afterTables.filter((table) => !beforeTables.includes(table));
const removed = beforeTables.filter((table) => !afterTables.includes(table));
if (
  JSON.stringify(added) !== JSON.stringify(['campaign_geographic_map_context_links']) ||
  removed.length > 0
) {
  throw new Error('Unexpected MAP-077 public schema drift: ' + JSON.stringify({ added, removed }));
}

const after = psql(compareSql);
if (before !== after) {
  throw new Error('MAP-077 altered legacy public records or timestamps during upgrade');
}

const facts = JSON.parse(
  psql(`
select pg_catalog.jsonb_build_object(
  'contexts', (select count(*) from public.map_contexts),
  'neverwinter', (select count(*) from public.map_contexts
    where id='map-neverwinter' and slug='neverwinter' and name='Neverwinter'
    and width=2048 and height=1582 and publication_status='published'
    and image_uri is null and loading_strategy is null and parent_id is null),
  'links', (select count(*) from public.campaign_geographic_map_context_links
    where campaign_id='00000000-0000-4000-8000-000000000068'
      and geographic_name_id='geo-neverwinter'
      and map_context_id='map-neverwinter'),
  'other_links', (select count(*) from public.campaign_geographic_map_context_links
    where campaign_id <> '00000000-0000-4000-8000-000000000068'),
  'placements', (select count(*) from public.entity_map_placements),
  'rls', (select relrowsecurity from pg_catalog.pg_class
    where oid='public.campaign_geographic_map_context_links'::regclass),
  'anon_read', pg_catalog.has_table_privilege(
    'anon','public.campaign_geographic_map_context_links','SELECT'),
  'anon_insert', pg_catalog.has_table_privilege(
    'anon','public.campaign_geographic_map_context_links','INSERT')
)::text;`),
);
if (
  facts.contexts !== 1 ||
  facts.neverwinter !== 1 ||
  facts.links !== 1 ||
  facts.other_links !== 0 ||
  facts.placements !== 0 ||
  !facts.rls ||
  !facts.anon_read ||
  facts.anon_insert
) {
  throw new Error('MAP-077 expansion invariants failed: ' + JSON.stringify(facts));
}

console.log('MAP-077 master -> local navigation rehearsal passed; legacy rows unchanged.');
