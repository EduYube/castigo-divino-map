const { spawnSync } = require('node:child_process');

const CONTAINER = 'supabase_db_castigo-divino-map';
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(command, args, label, input) {
  const output = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    input,
  });
  if (output.error || output.status !== 0) {
    throw new Error(
      `MAP-075 ${label}: ${output.error?.message ?? output.stderr ?? output.status}`,
    );
  }
  return output.stdout.trim();
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

run(
  NPX,
  [
    '--no-install',
    'supabase',
    'db',
    'reset',
    '--local',
    '--version',
    '20261008180000',
    '--no-seed',
  ],
  'reset to v1.2 final migration',
);

psql(`
insert into public.categories(campaign_id,id,slug,name,description,publication_status)
values ('00000000-0000-4000-8000-000000000053','category-map075-upgrade',
        'map075-upgrade','MAP075 upgrade','','published');
insert into public.map_entities
 (campaign_id,id,slug,entity_type,visibility,audience,name,summary,description,
 x,y,geometry,category_id,publication_status)
values
 ('00000000-0000-4000-8000-000000000053','place-map075-rehearsal',
  'map075-rehearsal','location','pin','public','MAP075 rehearsal place','','',
  45,66,'{"kind":"polygon","vertices":[{"x":20,"y":20},{"x":60,"y":20},{"x":60,"y":100}]}',
  'category-map075-upgrade','published');
insert into public.map_entities
 (campaign_id,id,slug,entity_type,visibility,audience,name,summary,description,
 x,y,category_id,publication_status)
values ('00000000-0000-4000-8000-000000000053','entity-map075-rehearsal-org',
        'map075-rehearsal-org','organization','search_only','public',
        'MAP075 rehearsal organization','','',null,null,'category-map075-upgrade','published');
insert into public.entity_relations
 (campaign_id,left_entity_id,right_entity_id,left_label,right_label)
values ('00000000-0000-4000-8000-000000000053',
        'entity-map075-rehearsal-org','place-map075-rehearsal',
        'Relacionado','Relacionado');
`);

// Full-row comparison of ALL public tables in v1.2, not just sample columns or counts.
// Ignore only the new MAP-075 column on map_entities.
function publicTables() {
  return psql("select tablename from pg_catalog.pg_tables where schemaname='public' order by tablename;")
    .split(/\r?\n/u).filter(Boolean);
}
function sqlIdentifier(name) {
  return '"' + name.replaceAll('"', '""') + '"';
}
function sqlLiteral(value) {
  return "'" + value.replaceAll("'", "''") + "'";
}
function snapshotSql(tables) {
  const fields = tables.map((name) => {
    const row = name === 'map_entities'
      ? "(pg_catalog.to_jsonb(legacy_row) - 'world_map_enabled')"
      : 'pg_catalog.to_jsonb(legacy_row)';
    return sqlLiteral(name) + ', (select coalesce(' +
      'pg_catalog.jsonb_agg(' + row + ' order by (' + row + ')::text), ' +
      "'[]'::jsonb) from public." + sqlIdentifier(name) + ' as legacy_row)';
  });
  return 'select pg_catalog.jsonb_build_object(' + fields.join(',\n') + ')::text;';
}
const tablesBefore = publicTables();
if (tablesBefore.length < 10 ||
    !tablesBefore.includes('categories') || !tablesBefore.includes('map_entities')) {
  throw new Error('MAP-075 rehearsal did not find the v1.2 public tables.');
}
const check = snapshotSql(tablesBefore);
const before = psql(check);
run(NPX, ['--no-install', 'supabase', 'migration', 'up', '--local'], 'migrate to MAP-075');
const tablesAfter = publicTables();
const added = tablesAfter.filter((name) => !tablesBefore.includes(name));
const removed = tablesBefore.filter((name) => !tablesAfter.includes(name));
if (JSON.stringify(added) !== JSON.stringify(['entity_map_placements','map_contexts']) ||
    removed.length > 0) {
  throw new Error('MAP-075 changed legacy table inventory: ' + JSON.stringify({ added, removed }));
}
const after = psql(check);
if (before !== after) {
  throw new Error('MAP-075 modified v1.2 public rows, content or timestamps:\n' +
                  'before=' + before + '\nafter=' + after);
}
// A same-cardinality category mutation MUST be noticed by this comparator.
// Do not change canonical data: the sensitivity probe is fully rolled back.
const mutated = psql(
  "begin;\nupdate public.categories set description='map075-mutation-probe' " +
  "where id='category-map075-upgrade';\n" + check + "\nrollback;",
);
if (mutated === after) {
  throw new Error('MAP-075 full-row comparator failed to detect content mutation.');
}
process.stdout.write('MAP-075 full-row comparator detected rolled-back mutation.\n');

const newTables = JSON.parse(
  psql(`
select pg_catalog.jsonb_build_object(
 'contexts',(select count(*) from public.map_contexts),
 'placements',(select count(*) from public.entity_map_placements),
 'world_default',(select count(*) from public.map_entities
   where not world_map_enabled),
 'migration_applied',pg_catalog.to_regclass('public.entity_map_placements') is not null
)::text;
`),
);
if (
  newTables.contexts !== 0 ||
  newTables.placements !== 0 ||
  newTables.world_default !== 0 ||
  !newTables.migration_applied
) {
  throw new Error(`MAP-075 expansion invariant failed: ${JSON.stringify(newTables)}`);
}
process.stdout.write(
  'MAP-075 v1.2 -> optional maps rehearsal passed; old rows unchanged.\\n',
);
