begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create function pg_temp.map075_rejects(statement text, expected_state text default null)
returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception when others then
  return expected_state is null or sqlstate = expected_state;
end;
$$;

-- INFRA-210: temporary RLS-test helpers need explicit EXECUTE after default ACL hardening.
grant execute on function pg_temp.map075_rejects(text, text) to anon, authenticated;

select plan(55);

select has_table('public','map_contexts','physical map surfaces are global');
select ok(
  not pg_catalog.has_function_privilege(
    'anon', 'private.normalize_map_context_geometry(public.entity_type,jsonb,double precision,double precision)', 'EXECUTE'
  ), 'anon cannot call local geometry normalizer'
);
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated', 'private.enforce_entity_map_placement()', 'EXECUTE'
  ), 'authenticated callers cannot invoke internal trigger functions'
);
select ok(
  pg_catalog.has_function_privilege(
    'authenticated', 'private.normalize_map_context_geometry(public.entity_type,jsonb,double precision,double precision)', 'EXECUTE'
  ), 'authenticated admin writes may use the guarded normalizer'
);
select has_table('public','entity_map_placements','campaign-scoped placements exist');
select fk_ok('public','entity_map_placements',array['entity_id','campaign_id'],
  'public','map_entities',array['id','campaign_id'],'composite campaign FK is authoritative');
select is((select count(*) from public.map_contexts where id = 'map-neverwinter'),1::bigint,'MAP-077 seeds one physical Neverwinter map');
select is((select count(*) from public.entity_map_placements),0::bigint,'no placements are seeded');

insert into public.map_contexts (id,slug,name,width,height,publication_status) values
('map-map075-root','map075-root','MAP075 synthetic root',200,300,'published');
insert into public.map_contexts (id,slug,name,parent_id,width,height,publication_status) values
('map-map075-local','map075-local','MAP075 synthetic local','map-map075-root',128,256,'published'),
('map-map075-draft','map075-draft','MAP075 draft','map-map075-root',128,256,'draft'),
('map-map075-archived','map075-archived','MAP075 archived','map-map075-root',128,256,'archived');

select is((select parent_id from public.map_contexts where id='map-map075-local'),
  'map-map075-root'::text,'valid hierarchy points at shared physical parent');
select ok(pg_temp.map075_rejects($q$
  insert into public.map_contexts(id,slug,name,parent_id,width,height)
  values('map-map075-self','map075-self','Self','map-map075-self',20,20)
$q$,'23514'),'self parent rejected');
select ok(pg_temp.map075_rejects($q$
  update public.map_contexts set parent_id='map-map075-local' where id='map-map075-root'
$q$,'23514'),'indirect cycle rejected');
select ok(pg_temp.map075_rejects($q$
  insert into public.map_contexts(id,slug,name,width,height)
  values('map-map075-badwidth','map075-badwidth','Bad',0,100)
$q$,'23514'),'zero dimensions rejected');
select ok(pg_temp.map075_rejects($q$
  insert into public.map_contexts(id,slug,name,width,height)
  values('invalid-id','map075-invalid','Bad ID',100,100)
$q$,'23514'),'map context ID format is enforced');
select ok(pg_temp.map075_rejects($q$
  insert into public.map_contexts(id,slug,name,width,height)
  values('map-map075-invalidslug','Invalid Slug','Bad slug',100,100)
$q$,'23514'),'map context slug format is enforced');
select ok(pg_temp.map075_rejects($q$
  insert into public.map_contexts(id,slug,name,width,height)
  values('map-map075-inf','map075-inf','Inf','Infinity'::float8,100)
$q$,'23514'),'infinite dimensions rejected');
select ok(pg_temp.map075_rejects($q$
  insert into public.map_contexts(id,slug,name,width,height)
  values('map-map075-root','map075-duplicate','Duplicate',20,20)
$q$,'23505'),'stable map ID is unique');
select ok(pg_temp.map075_rejects($q$
  insert into public.map_contexts(id,slug,name,width,height)
  values('map-map075-dupslug','map075-root','Duplicate slug',20,20)
$q$,'23505'),'map slug is globally unique');
select ok(pg_temp.map075_rejects($q$
  update public.map_contexts set slug='map075-renamed' where id='map-map075-root'
$q$,'23514'),'map identity stays stable');
select ok(pg_temp.map075_rejects($q$
  update public.map_contexts set publication_status='draft' where id='map-map075-root'
$q$,'23514'),'published parent cannot be unpublished under a published child');
select ok(pg_temp.map075_rejects($q$
  update public.map_contexts set parent_id='map-map075-draft' where id='map-map075-local'
$q$,'23514'),'published child cannot use draft parent');
select ok(pg_temp.map075_rejects($q$
  update public.map_contexts set image_uri='https://example.invalid/image.png' where id='map-map075-root'
$q$,'23514'),'image cannot be attached without recorded provenance and license');

insert into public.categories(campaign_id,id,slug,name,description,publication_status)
values
('00000000-0000-4000-8000-000000000053','category-map075-a','map075-a','MAP075 A','','published'),
('00000000-0000-4000-8000-000000000068','category-map075-b','map075-b','MAP075 B','','published');

insert into public.map_entities
(campaign_id,id,slug,entity_type,visibility,audience,name,summary,description,x,y,category_id,publication_status)
values
('00000000-0000-4000-8000-000000000053','place-map075-local','map075-local','location','pin','public','MAP075 Local','','',12,13,'category-map075-a','published'),
('00000000-0000-4000-8000-000000000053','entity-map075-char','map075-char','character','pin','public','MAP075 Character','','',14,15,'category-map075-a','published'),
('00000000-0000-4000-8000-000000000053','entity-map075-master','map075-master','character','pin','master','MAP075 Master','','',16,17,'category-map075-a','published'),
('00000000-0000-4000-8000-000000000053','entity-map075-org','map075-org','organization','search_only','public','MAP075 Org','','',null,null,'category-map075-a','published'),
('00000000-0000-4000-8000-000000000068','place-map075-campaignb','map075-campaignb','location','pin','public','MAP075 B','','',18,19,'category-map075-b','published');

insert into public.map_entities
(campaign_id,id,slug,entity_type,visibility,audience,name,summary,description,x,y,geometry,
 world_map_enabled,category_id,publication_status)
values
('00000000-0000-4000-8000-000000000053','place-map075-onlylocal','map075-onlylocal','location',
 'pin','public','MAP075 Only Local','','',null,null,null,false,'category-map075-a','published');

select is((select count(*) from public.map_entities
 where id='place-map075-onlylocal' and x is null and y is null and geometry is null
 and not world_map_enabled),1::bigint,'local-only spatial entity has no fake world coordinates');
select ok(pg_temp.map075_rejects($q$
 insert into public.map_entities
 (campaign_id,id,slug,entity_type,visibility,audience,name,summary,description,
  x,y,world_map_enabled,category_id,publication_status)
 values ('00000000-0000-4000-8000-000000000053','place-map075-half','map075-half',
 'location','pin','public','Invalid','','',0,null,false,'category-map075-a','draft')
$q$,'23514'),'partial/sentinel world coordinates remain prohibited');

insert into public.entity_map_placements
(campaign_id,map_context_id,entity_id,geometry,publication_status)
values
('00000000-0000-4000-8000-000000000053','map-map075-local','place-map075-local',
 '{"kind":"polygon","vertices":[{"x":40,"y":60},{"x":20,"y":60},{"x":20,"y":20},{"x":40,"y":20}]}','published'),
('00000000-0000-4000-8000-000000000053','map-map075-local','entity-map075-char',
 '{"kind":"point","coordinates":{"x":0,"y":0}}','published'),
('00000000-0000-4000-8000-000000000053','map-map075-local','entity-map075-master',
 '{"kind":"point","coordinates":{"x":7,"y":8}}','published'),
('00000000-0000-4000-8000-000000000053','map-map075-local','place-map075-onlylocal',
 '{"kind":"point","coordinates":{"x":11,"y":12}}','published'),
('00000000-0000-4000-8000-000000000068','map-map075-local','place-map075-campaignb',
 '{"kind":"point","coordinates":{"x":22,"y":23}}','draft'),
('00000000-0000-4000-8000-000000000053','map-map075-draft','entity-map075-char',
 '{"kind":"point","coordinates":{"x":2,"y":3}}','published');

select is((select geometry from public.entity_map_placements where entity_id='place-map075-local'),
 '{"kind":"polygon","vertices":[{"x":20,"y":20},{"x":40,"y":20},{"x":40,"y":60},{"x":20,"y":60}]}'::jsonb,
 'local polygon uses MAP-060 canonical orientation/rotation');
select is((select pg_catalog.jsonb_build_object('x',x,'y',y) from public.entity_map_placements
 where entity_id='place-map075-local'),'{"x":30,"y":40}'::jsonb,'polygon centre is deterministic');
select is((select pg_catalog.jsonb_build_object('x',x,'y',y) from public.entity_map_placements
 where entity_id='entity-map075-char' and map_context_id='map-map075-local'),
 '{"x":0,"y":0}'::jsonb,'point zero/zero remains legal');
select is((select count(*) from public.map_entities where id='place-map075-local' and x=12 and y=13),
 1::bigint,'placement never changes canonical entity world geometry');
select ok(pg_temp.map075_rejects($q$
 insert into public.entity_map_placements(campaign_id,map_context_id,entity_id,geometry)
 values('00000000-0000-4000-8000-000000000053','map-map075-local','entity-map075-org',
 '{"kind":"point","coordinates":{"x":5,"y":5}}')
$q$,'23514'),'organization placement is forbidden');
select ok(pg_temp.map075_rejects($q$
 insert into public.entity_map_placements(campaign_id,map_context_id,entity_id,geometry)
 values('00000000-0000-4000-8000-000000000053','map-map075-local','entity-map075-char',
 '{"kind":"point","coordinates":{"x":5,"y":5}}')
$q$,'23505'),'unique entity/context placement enforced');
select ok(pg_temp.map075_rejects($q$
 insert into public.entity_map_placements(campaign_id,map_context_id,entity_id,geometry)
 values('00000000-0000-4000-8000-000000000068','map-map075-local','place-map075-local',
 '{"kind":"point","coordinates":{"x":5,"y":5}}')
$q$,'23503'),'cross-campaign placement refused by storage');
select ok(pg_temp.map075_rejects($q$
 insert into public.entity_map_placements(campaign_id,map_context_id,entity_id,geometry)
 values('00000000-0000-4000-8000-000000000053','map-map075-local','place-map075-absent',
 '{"kind":"point","coordinates":{"x":5,"y":5}}')
$q$,'23503'),'nonexistent entity rejected');
select ok(pg_temp.map075_rejects($q$
 insert into public.entity_map_placements(campaign_id,map_context_id,entity_id,geometry)
 values('00000000-0000-4000-8000-000000000053','map-map075-absent','place-map075-local',
 '{"kind":"point","coordinates":{"x":5,"y":5}}')
$q$,'23503'),'nonexistent map rejected');
select ok(pg_temp.map075_rejects($q$
 update public.entity_map_placements
 set geometry='{"kind":"point","coordinates":{"x":129,"y":5}}'
 where entity_id='entity-map075-char'
$q$,'23514'),'local dimensions, not 3600x2329, bound every point');
select ok(pg_temp.map075_rejects($q$
 update public.entity_map_placements
 set geometry='{"kind":"polygon","vertices":[{"x":20,"y":20},{"x":129,"y":40},{"x":20,"y":50}]}'
 where entity_id='place-map075-local'
$q$,'23514'),'polygons also enforce local image bounds');
select ok(pg_temp.map075_rejects($q$
 update public.entity_map_placements set x=99 where entity_id='entity-map075-char'
$q$,'23514'),'derived representative x cannot be hand-edited');
select ok(pg_temp.map075_rejects($q$
 update public.map_contexts set width=12 where id='map-map075-local'
$q$,'23514'),'bounds cannot silently invalidate existing placements');


-- Regression MAP075-REV-01: JSON null or omitted fields must produce 23514.
select ok(pg_temp.map075_rejects($q$
 update public.entity_map_placements
 set geometry='{"kind":"polygon","vertices":[{"x":20,"y":20},{"x":40,"y":20},{"x":40,"y":null}]}'
 where entity_id='place-map075-local' and map_context_id='map-map075-local'
$q$,'23514'),'polygon UPDATE rejects JSON null y');
select ok(pg_temp.map075_rejects($q$
 update public.entity_map_placements
 set geometry='{"kind":"polygon","vertices":[{"x":20,"y":20},{"x":40,"y":20},{"x":null,"y":40}]}'
 where entity_id='place-map075-local' and map_context_id='map-map075-local'
$q$,'23514'),'polygon UPDATE rejects JSON null x');
select ok(pg_temp.map075_rejects($q$
 update public.entity_map_placements
 set geometry='{"kind":"polygon","vertices":[{"x":20,"y":20},{"x":40,"y":20},{"y":40}]}'
 where entity_id='place-map075-local' and map_context_id='map-map075-local'
$q$,'23514'),'polygon UPDATE rejects missing x');
select ok(pg_temp.map075_rejects($q$
 insert into public.entity_map_placements(campaign_id,map_context_id,entity_id,geometry)
 values('00000000-0000-4000-8000-000000000053','map-map075-root','place-map075-local',
 '{"kind":"polygon","vertices":[{"x":20,"y":20},{"x":40,"y":20},{"x":40}]}')
$q$,'23514'),'polygon INSERT rejects missing y');
select ok(pg_temp.map075_rejects($q$
 update public.entity_map_placements
 set geometry='{"kind":"point","coordinates":{"x":4,"y":null}}'
 where entity_id='entity-map075-char' and map_context_id='map-map075-local'
$q$,'23514'),'point UPDATE rejects JSON null y');
select ok(pg_temp.map075_rejects($q$
 update public.entity_map_placements
 set geometry='{"kind":"point","coordinates":{"y":4}}'
 where entity_id='entity-map075-char' and map_context_id='map-map075-local'
$q$,'23514'),'point UPDATE rejects missing x');
select ok(pg_temp.map075_rejects($q$
 insert into public.entity_map_placements(campaign_id,map_context_id,entity_id,geometry)
 values('00000000-0000-4000-8000-000000000053','map-map075-root','entity-map075-char',
 '{"kind":"point","coordinates":{"x":null,"y":3}}')
$q$,'23514'),'point INSERT rejects JSON null x');
select ok(pg_temp.map075_rejects($q$
 insert into public.entity_map_placements(campaign_id,map_context_id,entity_id,geometry)
 values('00000000-0000-4000-8000-000000000053','map-map075-root','entity-map075-char',
 '{"kind":"point","coordinates":{"x":3}}')
$q$,'23514'),'point INSERT rejects missing y');

set local role anon;
select is((select count(*) from public.map_contexts where id like 'map-map075-%'),
 2::bigint,'anon sees published contexts only (not draft or archived)');
select is((select count(*) from public.entity_map_placements where map_context_id='map-map075-local'),
 2::bigint,'anon sees only published public world-enabled entities and placements');
select is((select count(*) from public.entity_map_placements where entity_id='entity-map075-master'),
 0::bigint,'Master content never leaks via public placements');
select is((select count(*) from public.entity_map_placements where map_context_id='map-map075-draft'),
 0::bigint,'published placement never exposes a draft map context');
select is((select count(*) from public.map_entities where id='place-map075-onlylocal'),
 0::bigint,'legacy v1.2 world reader does not receive local-only coordinates');

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000099';
set local "request.jwt.claims" =
 '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}';
set local role authenticated;
select ok(pg_temp.map075_rejects($q$
 insert into public.map_contexts(id,slug,name,width,height) values
 ('map-map075-notadmin','map075-notadmin','Unauthorised',10,10)
$q$),'authenticated non-admin cannot write contexts');
with changed as (
  update public.entity_map_placements set publication_status='draft'
  where entity_id='entity-map075-char'
  returning 1
)
select is((select pg_catalog.count(*) from changed),
  0::bigint, 'authenticated non-admin updates cannot affect protected placements');

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" =
 '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok($q$
 insert into public.map_contexts(id,slug,name,parent_id,width,height)
 values ('map-map075-admin','map075-admin','Admin managed','map-map075-root',11,15)
$q$,'admin can create a valid draft map context');
select lives_ok($q$
 update public.entity_map_placements
 set publication_status='draft' where entity_id='entity-map075-char'
$q$,'admin can edit campaign placement editorial status');


select ok(pg_temp.map075_rejects($q$
 update public.entity_map_placements
 set geometry='{"kind":"polygon","vertices":[{"x":20,"y":20},{"x":40,"y":20},{"x":40,"y":null}]}'
 where entity_id='place-map075-local' and map_context_id='map-map075-local'
$q$,'23514'),'authenticated admin UPDATE cannot persist null polygon coordinate');
select ok(pg_temp.map075_rejects($q$
 insert into public.entity_map_placements(campaign_id,map_context_id,entity_id,geometry)
 values('00000000-0000-4000-8000-000000000053','map-map075-root','entity-map075-char',
 '{"kind":"point","coordinates":{"y":3}}')
$q$,'23514'),'authenticated admin INSERT rejects missing point coordinate');

reset role;
select * from finish();
rollback;
