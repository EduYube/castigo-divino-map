-- MAP-077 regression: stable Neverwinter identity, access, RLS and least privilege.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.map077_rejects(statement text)
returns boolean language plpgsql set search_path = '' as $$
begin
  execute statement;
  return false;
exception when others then
  return true;
end;
$$;
grant execute on function pg_temp.map077_rejects(text) to anon, authenticated;

select has_table('public', 'campaign_geographic_map_context_links',
  'campaign to geographic entrance links exist');
select fk_ok('public', 'campaign_geographic_map_context_links', array['campaign_id'],
  'public', 'campaigns', array['id'], 'campaign FK');
select fk_ok('public', 'campaign_geographic_map_context_links', array['geographic_name_id'],
  'public', 'geographic_names', array['id'], 'geography FK');
select fk_ok('public', 'campaign_geographic_map_context_links', array['map_context_id'],
  'public', 'map_contexts', array['id'], 'context FK');
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.campaign_geographic_map_context_links'::regclass),
  'RLS active');
select is((select count(*) from public.map_contexts where id = 'map-neverwinter'),
  1::bigint, 'one global Neverwinter context');
select is(
  (select (slug, name, width, height, parent_id, image_uri, loading_strategy,
           publication_status::text)::text
   from public.map_contexts where id='map-neverwinter'),
  ('neverwinter', 'Neverwinter', 2048::double precision, 1582::double precision,
   null::text, null::text, null::text, 'published')::text,
  '2048x1582 published neutral context, no parent/image/strategy');
select is((select count(*) from public.geographic_names where id='geo-neverwinter'),
  1::bigint,'existing geographic identity reused');
select is((select count(*) from public.map_entities where id='entity-neverwinter'),
  0::bigint,'Neverwinter entity not duplicated');
select is((select count(*) from public.campaign_geographic_map_context_links
 where campaign_id='00000000-0000-4000-8000-000000000068'
   and geographic_name_id='geo-neverwinter' and map_context_id='map-neverwinter'),
  1::bigint,'Un aliento menos links to Neverwinter');
select is((select count(*) from public.campaign_geographic_map_context_links
 where campaign_id='00000000-0000-4000-8000-000000000053'), 0::bigint,
 'Castigo Divino has no local entrance');
select is((select count(*) from public.entity_map_placements),0::bigint,
  'no productive placements created');
select ok(pg_temp.map077_rejects($q$
  insert into public.campaign_geographic_map_context_links
  (campaign_id,geographic_name_id,map_context_id)
  values('00000000-0000-4000-8000-000000000068','geo-neverwinter','map-neverwinter')
$q$),'duplicate entrance rejected');
select ok(pg_temp.map077_rejects($q$
  insert into public.campaign_geographic_map_context_links
  (campaign_id,geographic_name_id,map_context_id)
  values('00000000-0000-4000-8000-000000000099','geo-neverwinter','map-neverwinter')
$q$),'invalid campaign rejected');
select ok(pg_temp.map077_rejects($q$
  insert into public.campaign_geographic_map_context_links
  (campaign_id,geographic_name_id,map_context_id)
  values('00000000-0000-4000-8000-000000000068','geo-map077-unknown','map-neverwinter')
$q$),'invalid geography rejected');
select ok(pg_temp.map077_rejects($q$
  insert into public.campaign_geographic_map_context_links
  (campaign_id,geographic_name_id,map_context_id)
  values('00000000-0000-4000-8000-000000000068','geo-neverwinter','map-map077-unknown')
$q$),'invalid context rejected');
select ok(pg_catalog.has_table_privilege('anon',
 'public.campaign_geographic_map_context_links','SELECT'),'anon read is explicit');
select ok(not pg_catalog.has_table_privilege('anon',
 'public.campaign_geographic_map_context_links','INSERT'),'anon cannot insert');
select ok(not pg_catalog.has_table_privilege('authenticated',
 'public.campaign_geographic_map_context_links','UPDATE'),'no table-wide UPDATE');
select ok(pg_catalog.has_column_privilege('authenticated',
 'public.campaign_geographic_map_context_links','map_context_id','UPDATE'),
 'authenticated column-scoped update available for admin RLS');
select ok(not pg_catalog.has_column_privilege('authenticated',
 'public.campaign_geographic_map_context_links','campaign_id','UPDATE'),
 'campaign identity cannot be updated');
select ok(not pg_catalog.has_table_privilege('service_role',
 'public.campaign_geographic_map_context_links','TRUNCATE'),
 'INFRA210 future-table defaults remain denied');

insert into public.map_contexts(id,slug,name,width,height,publication_status)
values('map-map077-draft','map077-draft','MAP077 draft fixture',100,100,'draft');
insert into public.map_contexts(id,slug,name,width,height,publication_status)
values('map-map077-published','map077-published','MAP077 fixture',100,100,'published');
insert into public.campaign_geographic_map_context_links(
 campaign_id,geographic_name_id,map_context_id)
values ('00000000-0000-4000-8000-000000000053','geo-neverwinter','map-map077-draft');

set local role anon;
select is((select count(*) from public.campaign_geographic_map_context_links
 where geographic_name_id='geo-neverwinter'),1::bigint,'anon cannot see draft-linked entrance');
reset role;

update public.campaigns set status='archived',archived_at=now()
where id='00000000-0000-4000-8000-000000000068';
set local role anon;
select is((select count(*) from public.campaign_geographic_map_context_links
 where geographic_name_id='geo-neverwinter'),0::bigint,
 'inactive campaign entrance not public');
reset role;
update public.campaigns set status='active',archived_at=null
where id='00000000-0000-4000-8000-000000000068';

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000099';
set local "request.jwt.claims" =
 '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}';
set local role authenticated;
select ok(pg_temp.map077_rejects($q$
 insert into public.campaign_geographic_map_context_links(
 campaign_id,geographic_name_id,map_context_id)
 values('00000000-0000-4000-8000-000000000053','geo-neverwinter','map-map077-published')
$q$),'nonadmin write rejected');
reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" =
 '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok($q$
 update public.campaign_geographic_map_context_links
 set map_context_id='map-map077-published'
 where campaign_id='00000000-0000-4000-8000-000000000053'
$q$,'admin may maintain link under RLS');
reset role;

select * from finish();
rollback;
