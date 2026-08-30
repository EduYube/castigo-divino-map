begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create function pg_temp.statement_fails(statement text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return false;
exception
  when others then
    return true;
end;
$$;

select plan(24);

select has_column('public', 'map_entities', 'geometry', 'MAP-060 adds persistent geometry');
select ok(
  not exists (
    select 1
    from public.map_entities
    where geometry ->> 'kind' <> 'point'
       or (geometry #>> '{coordinates,x}')::double precision <> x
       or (geometry #>> '{coordinates,y}')::double precision <> y
  ),
  'all pre-MAP-060 entities are migrated in place to their original point coordinates'
);
select ok(
  not exists (
    select 1
    from public.map_entities
    where entity_type = 'character' and geometry ->> 'kind' <> 'point'
  ),
  'existing characters remain point geometries'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

insert into public.campaigns (id, slug, name, status, display_order)
values
  ('00000000-0000-4000-8000-000000000600', 'map060-a', 'MAP060 A', 'active', 600),
  ('00000000-0000-4000-8000-000000000601', 'map060-b', 'MAP060 B', 'active', 601);

insert into public.categories (campaign_id, id, slug, name, description, publication_status)
values
  ('00000000-0000-4000-8000-000000000600', 'category-map060-a', 'map060-a', 'MAP060 A', '', 'published'),
  ('00000000-0000-4000-8000-000000000601', 'category-map060-b', 'map060-b', 'MAP060 B', '', 'published');

insert into public.map_entities (
  campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
  x, y, category_id, publication_status, geometry
) values
  (
    '00000000-0000-4000-8000-000000000600', 'place-map060-public', 'map060-public',
    'location', 'pin', 'public', 'MAP060 Public', '', '', 0, 0, 'category-map060-a', 'published',
    '{"kind":"polygon","vertices":[{"x":300,"y":300},{"x":100,"y":300},{"x":100,"y":100},{"x":300,"y":100}]}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000600', 'place-map060-master', 'map060-master',
    'location', 'pin', 'master', 'MAP060 Master', '', '', 0, 0, 'category-map060-a', 'published',
    '{"kind":"polygon","vertices":[{"x":700,"y":700},{"x":500,"y":700},{"x":500,"y":500},{"x":700,"y":500}]}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000600', 'entity-map060-character', 'map060-character',
    'character', 'pin', 'public', 'MAP060 Character', '', '', 900, 900, 'category-map060-a', 'published',
    '{"kind":"point","coordinates":{"x":900,"y":900}}'::jsonb
  );

select is(
  (select geometry from public.map_entities where id = 'place-map060-public'),
  '{"kind":"polygon","vertices":[{"x":100,"y":100},{"x":300,"y":100},{"x":300,"y":300},{"x":100,"y":300}]}'::jsonb,
  'valid polygons are stored with deterministic orientation and rotation'
);
select is(
  (select pg_catalog.jsonb_build_object('x', x, 'y', y) from public.map_entities where id = 'place-map060-public'),
  '{"x":200,"y":200}'::jsonb,
  'polygon x/y are the deterministic bounding-box representative point'
);

select ok(
  pg_temp.statement_fails($sql$
    update public.map_entities
    set geometry = '{"kind":"polygon","vertices":[{"x":10,"y":10},{"x":20,"y":20}]}'::jsonb
    where id = 'place-map060-public'
  $sql$),
  'polygons with fewer than three vertices are rejected'
);
select ok(
  pg_temp.statement_fails($sql$
    update public.map_entities
    set geometry = '{"kind":"polygon","vertices":[{"x":-1,"y":10},{"x":20,"y":10},{"x":20,"y":20}]}'::jsonb
    where id = 'place-map060-public'
  $sql$),
  'out-of-bounds polygon coordinates are rejected'
);
select ok(
  pg_temp.statement_fails($sql$
    update public.map_entities
    set geometry = '{"kind":"polygon","vertices":[{"x":10,"y":10},{"x":20,"y":20},{"x":30,"y":30}]}'::jsonb
    where id = 'place-map060-public'
  $sql$),
  'degenerate zero-area polygons are rejected'
);
select ok(
  pg_temp.statement_fails($sql$
    update public.map_entities
    set geometry = '{"kind":"polygon","vertices":[{"x":10,"y":10},{"x":30,"y":30},{"x":10,"y":30},{"x":30,"y":10}]}'::jsonb
    where id = 'place-map060-public'
  $sql$),
  'self-intersecting polygons are rejected'
);
select ok(
  pg_temp.statement_fails($sql$
    update public.map_entities
    set geometry = '{"kind":"polygon","vertices":[{"x":800,"y":800},{"x":1000,"y":800},{"x":900,"y":1000}]}'::jsonb
    where id = 'entity-map060-character'
  $sql$),
  'character plus polygon is rejected by the backend'
);
select ok(
  pg_temp.statement_fails($sql$
    update public.map_entities set x = 201 where id = 'place-map060-public'
  $sql$),
  'polygon representative coordinates cannot become a second editable position'
);

insert into public.tags (campaign_id, id, name, description, publication_status)
values ('00000000-0000-4000-8000-000000000600', 'map060-tag', 'MAP060 tag', '', 'published');
insert into public.entity_tags (campaign_id, entity_id, tag_id, publication_status)
values ('00000000-0000-4000-8000-000000000600', 'place-map060-public', 'map060-tag', 'published');

update public.map_entities
set geometry = '{"kind":"point","coordinates":{"x":250,"y":260}}'::jsonb
where id = 'place-map060-public';
select is(
  (select id || ':' || slug from public.map_entities where id = 'place-map060-public'),
  'place-map060-public:map060-public',
  'point/polygon transitions preserve entity identity and slug'
);
select is(
  (select count(*) from public.entity_tags where entity_id = 'place-map060-public' and tag_id = 'map060-tag'),
  1::bigint,
  'point/polygon transitions preserve existing relations'
);
select is(
  (select geometry from public.map_entities where id = 'place-map060-public'),
  '{"kind":"point","coordinates":{"x":250,"y":260}}'::jsonb,
  'polygon to point round-trip stores canonical point geometry'
);

update public.map_entities
set geometry = '{"kind":"polygon","vertices":[{"x":100,"y":100},{"x":300,"y":100},{"x":300,"y":300},{"x":100,"y":300}]}'::jsonb
where id = 'place-map060-public';
select ok(
  (public.admin_get_map_entity_editor_v6(
    '00000000-0000-4000-8000-000000000600', 'place-map060-public'
  ) #> '{record,geometry}') =
  (select geometry from public.map_entities where id = 'place-map060-public'),
  'geometry-aware editor projection round-trips canonical geometry'
);
select ok(
  (public.admin_get_master_catalog_v5('00000000-0000-4000-8000-000000000600') -> 'entities')
    @> '[{"id":"place-map060-master","geometry":{"kind":"polygon","vertices":[{"x":500,"y":500},{"x":700,"y":500},{"x":700,"y":700},{"x":500,"y":700}]}}]'::jsonb,
  'authorized Master catalog exposes canonical Master geometry'
);
select ok(
  pg_temp.statement_fails($sql$
    select public.admin_save_map_entity_v6(
      '00000000-0000-4000-8000-000000000601',
      'place-map060-public',
      (select updated_at from public.map_entities where id = 'place-map060-public'),
      (public.admin_get_map_entity_editor_v5('00000000-0000-4000-8000-000000000600', 'place-map060-public') ->> 'relations_revision'),
      'map060-public', 'location', 'pin', 'public', null, 'MAP060 Public', '', '',
      '{"kind":"polygon","vertices":[{"x":100,"y":100},{"x":300,"y":100},{"x":300,"y":300},{"x":100,"y":300}]}'::jsonb,
      'category-map060-a', 'published', '{}'::text[], '[]'::jsonb, '{}'::text[]
    )
  $sql$),
  'geometry-aware save cannot cross campaign A/B boundaries'
);

select ok(
  not has_function_privilege('anon', 'public.admin_get_map_entity_editor_v6(uuid,text)', 'EXECUTE'),
  'anon cannot execute geometry-aware editor projection'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.admin_save_map_entity_v6(uuid,text,timestamptz,text,text,entity_type,map_visibility,entity_audience,text,text,text,text,jsonb,text,publication_status,text[],jsonb,text[])',
    'EXECUTE'
  ),
  'anon cannot execute geometry-aware save RPC'
);
select ok(
  not has_function_privilege('anon', 'public.admin_get_master_catalog_v5(uuid)', 'EXECUTE'),
  'anon cannot execute geometry-aware Master catalog'
);

reset role;
set local role anon;

select is(
  (select count(*) from public.map_entities where id = 'place-map060-public'),
  1::bigint,
  'public polygon remains visible as one public entity'
);
select is(
  (select geometry from public.map_entities where id = 'place-map060-public'),
  '{"kind":"polygon","vertices":[{"x":100,"y":100},{"x":300,"y":100},{"x":300,"y":300},{"x":100,"y":300}]}'::jsonb,
  'public projection can include the public polygon geometry'
);
select is(
  (select count(*) from public.map_entities where id = 'place-map060-master'),
  0::bigint,
  'anon cannot infer the existence, vertices, bounds, centre, extent or vertex count of a Master polygon'
);
select ok(
  pg_temp.statement_fails($sql$
    select public.admin_get_master_catalog_v5('00000000-0000-4000-8000-000000000600')
  $sql$),
  'anon cannot bypass row filtering through the Master geometry RPC'
);

reset role;
select * from finish();
rollback;
