-- MAP-079: campaign-bound public local placements and local-only privacy.
-- All synthetic content is transaction-local; there are no productive inserts.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.map079_rejects(statement text, expected_sqlstate text)
returns boolean language plpgsql set search_path = '' as $$
begin
  execute statement;
  raise notice 'MAP079 unexpected DML success, expected SQLSTATE %', expected_sqlstate;
  return false;
exception when others then
  if SQLSTATE <> expected_sqlstate then
    raise notice 'MAP079 SQLSTATE mismatch: got %, expected %, detail: %',
      SQLSTATE, expected_sqlstate, SQLERRM;
  end if;
  return SQLSTATE = expected_sqlstate;
end;
$$;
grant execute on function pg_temp.map079_rejects(text,text) to anon, authenticated;

select ok((select relrowsecurity from pg_catalog.pg_class
  where oid='public.map_entities'::regclass), 'map_entities RLS is enabled');
select ok((select relrowsecurity from pg_catalog.pg_class
  where oid='public.entity_map_placements'::regclass), 'placements RLS is enabled');
select has_function('private','map079_public_local_placement_exists',
  array['uuid','text','text'],'non-recursive local authorization predicate');
select ok(pg_catalog.has_function_privilege('anon',
 'private.map079_public_local_placement_exists(uuid,text,text)','EXECUTE'),
 'anon has explicit RLS predicate EXECUTE grant');
select ok(not pg_catalog.has_table_privilege('anon',
 'public.entity_map_placements','INSERT'), 'anon cannot insert placements');
select ok(not pg_catalog.has_table_privilege('authenticated',
 'public.entity_map_placements','UPDATE'),'no blanket authenticated UPDATE');
select ok(pg_catalog.has_column_privilege('authenticated',
 'public.entity_map_placements','geometry','UPDATE'),
 'admin geometry UPDATE stays column-scoped');
select ok(not pg_catalog.has_table_privilege('authenticated',
 'public.entity_map_placements','TRUNCATE'),'INFRA #210 authenticated TRUNCATE denied');

insert into public.categories
(campaign_id,id,slug,name,description,publication_status)
values
('00000000-0000-4000-8000-000000000068','category-map079-public','map079-public','MAP079 Test','','published'),
('00000000-0000-4000-8000-000000000068','category-map079-draft','map079-draft','MAP079 Draft','','draft'),
('00000000-0000-4000-8000-000000000053','category-map079-other','map079-other','MAP079 Other','','published');

insert into public.map_contexts(id,slug,name,width,height,publication_status)
values
('map-map079-second','map079-second','MAP079 second local',150,180,'published'),
('map-map079-unbound','map079-unbound','MAP079 unbound',150,180,'published'),
('map-map079-draft','map079-draft','MAP079 draft',150,180,'draft');
insert into public.campaign_geographic_map_context_links
(campaign_id,geographic_name_id,map_context_id)
values
('00000000-0000-4000-8000-000000000068','geo-waterdeep','map-map079-second'),
('00000000-0000-4000-8000-000000000068','geo-luskan','map-map079-draft');

insert into public.map_entities
(campaign_id,id,slug,entity_type,visibility,audience,name,summary,description,
 x,y,category_id,publication_status)
values
('00000000-0000-4000-8000-000000000068','entity-map079-world','map079-world','character','pin','public','MAP079 World','','',20,21,'category-map079-public','published'),
('00000000-0000-4000-8000-000000000068','entity-map079-master','map079-master','character','pin','master','MAP079 Master','','',26,27,'category-map079-public','published'),
('00000000-0000-4000-8000-000000000068','entity-map079-draftentity','map079-draftentity','character','pin','public','MAP079 Draft','','',24,25,'category-map079-public','draft'),
('00000000-0000-4000-8000-000000000068','entity-map079-org','map079-org','organization','search_only','public','MAP079 Org','','',null,null,'category-map079-public','published'),
('00000000-0000-4000-8000-000000000053','entity-map079-other','map079-other','character','pin','public','MAP079 Other','','',30,31,'category-map079-other','published');

insert into public.map_entities
(campaign_id,id,slug,entity_type,visibility,audience,name,summary,description,
 x,y,geometry,world_map_enabled,category_id,publication_status)
values
('00000000-0000-4000-8000-000000000068','entity-map079-only','map079-only','character','pin','public','MAP079 Only','','',null,null,null,false,'category-map079-public','published'),
('00000000-0000-4000-8000-000000000068','place-map079-poly','map079-poly','location','pin','public','MAP079 Polygon','','',null,null,null,false,'category-map079-public','published'),
('00000000-0000-4000-8000-000000000068','entity-map079-no-placement','map079-no-placement','character','pin','public','MAP079 No Placement','','',null,null,null,false,'category-map079-public','published'),
('00000000-0000-4000-8000-000000000068','entity-map079-placementdraft','map079-placementdraft','character','pin','public','MAP079 Draft Placement','','',null,null,null,false,'category-map079-public','published'),
('00000000-0000-4000-8000-000000000068','entity-map079-private','map079-private','character','pin','master','MAP079 Private','','',null,null,null,false,'category-map079-public','published'),
('00000000-0000-4000-8000-000000000068','entity-map079-draftlocal','map079-draftlocal','character','pin','public','MAP079 Local Draft','','',null,null,null,false,'category-map079-public','draft'),
('00000000-0000-4000-8000-000000000068','entity-map079-badcategory','map079-badcategory','character','pin','public','MAP079 Hidden Category','','',null,null,null,false,'category-map079-draft','draft');

-- The schema rejects publishing a draft-category entity before RLS is even consulted.
select ok(pg_temp.map079_rejects($q$
 update public.map_entities set publication_status='published'
 where id='entity-map079-badcategory'
$q$,'23514'),'published entity cannot reference unpublished category');

insert into public.entity_map_placements
(campaign_id,map_context_id,entity_id,geometry,publication_status)
values
('00000000-0000-4000-8000-000000000068','map-neverwinter','entity-map079-world',
 '{"kind":"point","coordinates":{"x":100,"y":101}}','published'),
('00000000-0000-4000-8000-000000000068','map-map079-second','entity-map079-world',
 '{"kind":"point","coordinates":{"x":1,"y":2}}','published'),
('00000000-0000-4000-8000-000000000068','map-neverwinter','entity-map079-only',
 '{"kind":"point","coordinates":{"x":110,"y":111}}','published'),
('00000000-0000-4000-8000-000000000068','map-map079-second','entity-map079-only',
 '{"kind":"point","coordinates":{"x":3,"y":4}}','published'),
('00000000-0000-4000-8000-000000000068','map-neverwinter','place-map079-poly',
 '{"kind":"polygon","vertices":[{"x":40,"y":20},{"x":40,"y":40},{"x":20,"y":40},{"x":20,"y":20}]}','published'),
('00000000-0000-4000-8000-000000000068','map-neverwinter','entity-map079-master',
 '{"kind":"point","coordinates":{"x":11,"y":12}}','published'),
('00000000-0000-4000-8000-000000000068','map-neverwinter','entity-map079-private',
 '{"kind":"point","coordinates":{"x":12,"y":13}}','published'),
('00000000-0000-4000-8000-000000000068','map-neverwinter','entity-map079-draftentity',
 '{"kind":"point","coordinates":{"x":13,"y":14}}','published'),
('00000000-0000-4000-8000-000000000068','map-neverwinter','entity-map079-draftlocal',
 '{"kind":"point","coordinates":{"x":14,"y":15}}','published'),
('00000000-0000-4000-8000-000000000068','map-neverwinter','entity-map079-badcategory',
 '{"kind":"point","coordinates":{"x":15,"y":16}}','published'),
('00000000-0000-4000-8000-000000000068','map-neverwinter','entity-map079-placementdraft',
 '{"kind":"point","coordinates":{"x":16,"y":17}}','draft'),
('00000000-0000-4000-8000-000000000068','map-map079-draft','entity-map079-only',
 '{"kind":"point","coordinates":{"x":18,"y":19}}','published'),
('00000000-0000-4000-8000-000000000068','map-map079-unbound','entity-map079-only',
 '{"kind":"point","coordinates":{"x":18,"y":19}}','published'),
('00000000-0000-4000-8000-000000000053','map-neverwinter','entity-map079-other',
 '{"kind":"point","coordinates":{"x":11,"y":12}}','published');

-- This extra draft placement uses a third map, not the published PK.
select ok(pg_temp.map079_rejects($q$
 insert into public.entity_map_placements
 (campaign_id,map_context_id,entity_id,geometry)
 values('00000000-0000-4000-8000-000000000068','map-map079-unbound','entity-map079-org',
 '{"kind":"point","coordinates":{"x":1,"y":1}}')
$q$,'23514'),'organizations cannot acquire local placements');
select ok(pg_temp.map079_rejects($q$
 insert into public.entity_map_placements
 (campaign_id,map_context_id,entity_id,geometry)
 values('00000000-0000-4000-8000-000000000053','map-map079-second','entity-map079-only',
 '{"kind":"point","coordinates":{"x":5,"y":6}}')
$q$,'23503'),'composite campaign FK rejects cross-campaign placement');

set local role anon;
select is((select count(*) from public.entity_map_placements
 where campaign_id='00000000-0000-4000-8000-000000000068'),5::bigint,
 'anon sees two world + two local-only + one polygon bound published placements');
select is((select count(*) from public.entity_map_placements
 where map_context_id='map-map079-unbound'),0::bigint,
 'unbound context never exposes even a published placement');
select is((select count(*) from public.entity_map_placements
 where map_context_id='map-map079-draft'),0::bigint,
 'draft context remains invisible despite a link');
select is((select count(*) from public.entity_map_placements
 where campaign_id='00000000-0000-4000-8000-000000000053'),0::bigint,
 'another campaign cannot use Neverwinter without its own binding');
select is((select count(*) from public.map_entities
 where id='entity-map079-only'),1::bigint,'local-only public entity becomes readable');
select is((select count(*) from public.map_entities
 where id in ('entity-map079-no-placement','entity-map079-placementdraft')),0::bigint,'unplaced local-only entity stays private');
select is((select count(*) from public.map_entities
 where id in ('entity-map079-master','entity-map079-private','entity-map079-draftlocal',
              'entity-map079-draftentity','entity-map079-badcategory')),0::bigint,
 'Master, draft and unpublished-category entities are never readable');
select is((select count(*) from public.map_entities
 where id in ('entity-map079-world','entity-map079-only') and world_map_enabled),
 1::bigint,'explicit world predicate excludes local-only rows');
select is((select count(distinct entity_id) from public.entity_map_placements
 where entity_id in ('entity-map079-world','entity-map079-only')),
 2::bigint,'two local contexts do not duplicate canonical entity IDs');
select is((select count(*) from public.entity_map_placements
 where entity_id='entity-map079-only' and map_context_id='map-neverwinter'),
 1::bigint,'published local-only placement is visible in active bound context');
select is((select count(*) from public.entity_map_placements
 where entity_id='place-map079-poly' and geometry ->> 'kind'='polygon'),
 1::bigint,'local-only location polygon is visible');
reset role;

update public.campaigns set status='archived',archived_at=now()
where id='00000000-0000-4000-8000-000000000068';
set local role anon;
select is((select count(*) from public.entity_map_placements
 where campaign_id='00000000-0000-4000-8000-000000000068'),
 0::bigint,'inactive campaign purges all local placements');
select is((select count(*) from public.map_entities where id='entity-map079-only'),
 0::bigint,'inactive campaign purges local-only details');
reset role;
update public.campaigns set status='active',archived_at=null
where id='00000000-0000-4000-8000-000000000068';

set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000099';
set local "request.jwt.claims"=
 '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}';
set local role authenticated;
select ok(pg_temp.map079_rejects($q$
 insert into public.entity_map_placements
 (campaign_id,map_context_id,entity_id,geometry)
 values('00000000-0000-4000-8000-000000000068','map-map079-second',
 'place-map079-poly','{"kind":"point","coordinates":{"x":1,"y":2}}')
$q$,'23503'),'authenticated nonadmin cannot insert into context hidden by lock/RLS');
with changed as (
 update public.entity_map_placements set geometry='{"kind":"point","coordinates":{"x":7,"y":8}}'
 where entity_id='entity-map079-only' returning 1
)
select is((select count(*) from changed),0::bigint,'nonadmin cannot mutate visible placements');
reset role;
select is((select count(*) from public.entity_map_placements
 where campaign_id='00000000-0000-4000-8000-000000000068'
   and map_context_id='map-map079-second' and entity_id='place-map079-poly'),
 0::bigint,'nonadmin rejected insert leaves placement inventory unchanged');

set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims"=
 '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok($q$
 update public.entity_map_placements
 set publication_status='draft'
 where campaign_id='00000000-0000-4000-8000-000000000068'
   and map_context_id='map-map079-second' and entity_id='entity-map079-world'
$q$,'admin retains editorial placement write contract');
select lives_ok($q$
 insert into public.entity_map_placements
 (campaign_id,map_context_id,entity_id,geometry)
 values('00000000-0000-4000-8000-000000000068','map-map079-second',
 'place-map079-poly','{"kind":"point","coordinates":{"x":1,"y":2}}')
$q$,'admin can insert the identical valid placement rejected for nonadmin');
reset role;

select * from finish();
rollback;
