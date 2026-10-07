import { spawnSync } from 'node:child_process';

const DB = 'supabase_db_castigo-divino-map';
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const BASE = '20260902111000';
const A = '00000000-0000-4000-8000-000000000053';
const B = '00000000-0000-4000-8000-000000000068';
const V = 'entity-request-07d26371bbff42d9b91e076d099891b0';

function fail(message) {
  throw new Error(`MAP-068 campaign separation rehearsal failed: ${message}`);
}
function run(command, args, description) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) fail(`${description}: ${result.error.message}`);
  if (result.status !== 0) fail(`${description} exited with status ${result.status ?? 'unknown'}`);
  return result.stdout.trim();
}
function sql(query) {
  return run(
    'docker',
    [
      'exec',
      '--user',
      'postgres',
      DB,
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
      query,
    ],
    'running rehearsal SQL',
  );
}

run(
  NPX,
  ['--no-install', 'supabase', 'db', 'reset', '--local', '--version', BASE, '--no-seed'],
  'resetting to pre-MAP-068',
);

const others = [
  'entity-agamen',
  'entity-asentamiento-thar',
  'entity-bring',
  'entity-captitan',
  'entity-jhonny',
  'entity-masred',
  'entity-memnon',
  'entity-myrath',
  'entity-ojos-tempestad',
  'entity-thalasis',
  'entity-thar',
  'entity-tulu',
  'place-demo-harbor',
  'place-demo-pass',
];
const entities = [
  ['entity-skade', 'skade', 'Skade', 'category-pj'],
  ['entity-ura', 'ura', 'Ura', 'category-pj'],
  [V, 'request-07d26371bbff42d9b91e076d099891b0', 'Veyra', 'category-pj'],
  ...others.map((id, index) => [id, `map068-${index}`, `MAP068 ${index}`, 'category-other']),
];
const entityValues = entities
  .map(
    ([id, slug, name, category], index) =>
      `('${A}','${id}','${slug}','character','pin','public','${name}','en','','',${800 + index},${600 + index},'${category}','published','2026-08-12T11:04:17Z','2026-08-14T19:35:13Z')`,
  )
  .join(',\n');

sql(`
insert into public.categories (
  campaign_id,id,slug,name,description,publication_status,published_at
) values
  ('${A}','category-pj','personaje','Personaje','Personaje','published','2026-08-13T07:40:25Z'),
  ('${A}','category-other','map068-other','Other','Other','published','2026-08-13T07:40:25Z');

insert into public.map_entities (
  campaign_id,id,slug,entity_type,visibility,audience,name,name_language,summary,description,
  x,y,category_id,publication_status,created_at,updated_at
) values ${entityValues};

alter table public.map_entities disable trigger "90_map_entity_updated_at";
update public.map_entities
set portrait_path='portraits/9d3dcfeb-0320-4bca-9f5d-941d68aa6410.jpg',
    description='Posición inicial Veyra (dudo entre neverwinter y lidian)',
    x=1425.88,
    y=1855.21,
    geometry='{"kind":"point","coordinates":{"x":1425.88,"y":1855.21}}'::jsonb
where id='${V}';
alter table public.map_entities enable trigger "90_map_entity_updated_at";

insert into public.tags (
  campaign_id,id,name,description,publication_status,published_at,created_at,updated_at
) values (
  '${A}','category-veyra','Veyra','Relacionado o perteneciente a Veyra','published',
  '2026-08-13T07:39:39Z','2026-08-13T07:39:39Z','2026-08-13T07:39:50Z'
);

insert into public.entity_tags (
  campaign_id,id,entity_id,tag_id,publication_status,published_at,created_at,updated_at
) values (
  '${A}','entity-tag-432d9dc2a2b6dbd6a450f556','${V}','category-veyra','published',
  '2026-08-13T07:41:39Z','2026-08-13T07:41:30Z','2026-08-13T07:41:39Z'
);

insert into public.players (
  campaign_id,id,slug,display_name,name_language,publication_status,published_at,
  created_at,updated_at,display_order,accent_color
) values
  ('${A}','player-skade','skade','Skade','en','published','2026-08-27T12:40:57Z','2026-08-27T12:40:57Z','2026-08-27T12:40:57Z',0,'#c2410c'),
  ('${A}','player-ura','ura','Ura','en','published','2026-08-27T12:40:57Z','2026-08-27T12:40:57Z','2026-08-27T12:40:57Z',1,'#1e3a8a'),
  ('${A}','player-veyra','veyra','Veyra','en','published','2026-08-27T12:40:57Z','2026-08-27T12:40:57Z','2026-08-27T12:40:57Z',2,'#9d174d');

alter table public.public_requests disable trigger "20_validate_public_request";
insert into public.public_requests (
  id,campaign_id,sender_name,proposed_name,entity_type,x,y,description,reason,request_status,
  converted_entity_id,moderated_at,created_at,updated_at
) values (
  '07d26371-bbff-42d9-b91e-076d099891b0','${A}','Veyra la Grandiosa','Veyra','character',
  1438.727724022,1837.31274570082,'Posición inicial Veyra (dudo entre neverwinter y lidian)',
  'Inicio partida picara','converted','${V}','2026-08-12T11:04:17Z',
  '2026-08-11T20:13:31Z','2026-08-12T11:04:17Z'
);
alter table public.public_requests enable trigger "20_validate_public_request";
`);

const before = JSON.parse(
  sql(`
select jsonb_build_object(
  'entity_id',(select id from public.map_entities where id='${V}'),
  'player_id',(select id from public.players where id='player-veyra'),
  'slug',(select slug from public.map_entities where id='${V}'),
  'portrait',(select portrait_path from public.map_entities where id='${V}'),
  'geometry',(select geometry from public.map_entities where id='${V}'),
  'entity_created',(select created_at from public.map_entities where id='${V}'),
  'entity_updated',(select updated_at from public.map_entities where id='${V}'),
  'player_created',(select created_at from public.players where id='player-veyra'),
  'player_updated',(select updated_at from public.players where id='player-veyra'),
  'tag_updated',(select updated_at from public.tags where id='category-veyra'),
  'entity_tag_updated',(select updated_at from public.entity_tags where id='entity-tag-432d9dc2a2b6dbd6a450f556'),
  'request_updated',(select updated_at from public.public_requests where id='07d26371-bbff-42d9-b91e-076d099891b0'),
  'veyra_player_dispositions',(select count(*) from public.entity_player_dispositions where player_id='player-veyra'),
  'veyra_entity_dispositions',(select count(*) from public.entity_player_dispositions where entity_id='${V}'),
  'veyra_union_dispositions',(select count(*) from public.entity_player_dispositions where player_id='player-veyra' or entity_id='${V}')
)::text;
`)
    .split(/\r?\n/u)
    .filter(Boolean)
    .at(-1),
);

if (
  before.veyra_player_dispositions !== 17 ||
  before.veyra_entity_dispositions !== 3 ||
  before.veyra_union_dispositions !== 19
) {
  fail(`unexpected pre-migration disposition inventory: ${JSON.stringify(before)}`);
}

run(NPX, ['--no-install', 'supabase', 'migration', 'up', '--local'], 'applying MAP-068');

const after = JSON.parse(
  sql(`
with checks as (
  select
    (select count(*) from public.campaigns where id='${B}' and slug='un-aliento-menos' and name='Un aliento menos')=1 as campaign_created,
    (select array_agg(id order by display_order,id) from public.players where campaign_id='${A}')=array['player-skade','player-ura']::text[] as castigo_roster,
    (select array_agg(id order by display_order,id) from public.players where campaign_id='${B}')=array['player-veyra']::text[] as aliento_roster,
    exists(select 1 from public.map_entities where id='${V}' and campaign_id='${B}') as entity_moved,
    exists(select 1 from public.players where id='player-veyra' and campaign_id='${B}' and character_entity_id='${V}') as player_moved,
    exists(select 1 from public.public_requests where id='07d26371-bbff-42d9-b91e-076d099891b0' and campaign_id='${B}' and converted_entity_id='${V}') as request_moved,
    exists(select 1 from public.tags where id='category-veyra' and campaign_id='${B}') as tag_moved,
    exists(select 1 from public.entity_tags where id='entity-tag-432d9dc2a2b6dbd6a450f556' and campaign_id='${B}') as tag_link_moved,
    exists(select 1 from public.categories where id='category-pj' and campaign_id='${A}') as shared_category_preserved,
    exists(select 1 from public.categories where id='category-pj-un-aliento-menos' and campaign_id='${B}') as category_cloned,
    (select count(*) from public.entity_player_dispositions where player_id='player-veyra' or entity_id='${V}')=0 as dispositions_removed,
    not exists(select 1 from public.entity_player_dispositions d join public.map_entities e on e.id=d.entity_id join public.players p on p.id=d.player_id where d.campaign_id<>e.campaign_id or d.campaign_id<>p.campaign_id) as no_cross_dispositions,
    not exists(select 1 from public.entity_player_associations a join public.map_entities e on e.id=a.entity_id join public.players p on p.id=a.player_id where a.campaign_id<>e.campaign_id or a.campaign_id<>p.campaign_id) as no_cross_associations,
    not exists(select 1 from public.public_requests r join public.map_entities e on e.id=r.converted_entity_id where r.converted_entity_id is not null and r.campaign_id<>e.campaign_id) as no_cross_requests
)
select to_jsonb(checks)::text from checks;
`)
    .split(/\r?\n/u)
    .filter(Boolean)
    .at(-1),
);

for (const [name, ok] of Object.entries(after)) {
  if (ok !== true) fail(`postcondition failed: ${name}`);
}

const preserved = JSON.parse(
  sql(`
select jsonb_build_object(
  'entity_id',(select id from public.map_entities where id='${V}'),
  'player_id',(select id from public.players where id='player-veyra'),
  'slug',(select slug from public.map_entities where id='${V}'),
  'portrait',(select portrait_path from public.map_entities where id='${V}'),
  'geometry',(select geometry from public.map_entities where id='${V}'),
  'entity_created',(select created_at from public.map_entities where id='${V}'),
  'entity_updated',(select updated_at from public.map_entities where id='${V}'),
  'player_created',(select created_at from public.players where id='player-veyra'),
  'player_updated',(select updated_at from public.players where id='player-veyra'),
  'tag_updated',(select updated_at from public.tags where id='category-veyra'),
  'entity_tag_updated',(select updated_at from public.entity_tags where id='entity-tag-432d9dc2a2b6dbd6a450f556'),
  'request_updated',(select updated_at from public.public_requests where id='07d26371-bbff-42d9-b91e-076d099891b0')
)::text;
`)
    .split(/\r?\n/u)
    .filter(Boolean)
    .at(-1),
);

for (const key of [
  'entity_id',
  'player_id',
  'slug',
  'portrait',
  'geometry',
  'entity_created',
  'entity_updated',
  'player_created',
  'player_updated',
  'tag_updated',
  'entity_tag_updated',
  'request_updated',
]) {
  if (JSON.stringify(before[key]) !== JSON.stringify(preserved[key])) {
    fail(`preservation failed for ${key}`);
  }
}

console.log(
  'MAP-068 rehearsal passed: 19 audited dispositions removed (18 cross-campaign + 1 self); stable Veyra identity/history preserved.',
);
