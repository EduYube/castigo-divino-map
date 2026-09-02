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

select plan(29);

select is(
  (
    select array_agg(enumlabel order by enumsortorder)::text[]
    from pg_enum
    where enumtypid = 'public.entity_lifecycle_status'::regtype
  ),
  array['active', 'completed', 'failed', 'resolved']::text[],
  'functional lifecycle values are closed and ordered'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'map_entities'
      and column_name = 'lifecycle_status'
      and is_nullable = 'YES'
  ),
  'map_entities exposes nullable functional lifecycle'
);

select is(
  (select count(*) from public.map_entities
   where entity_type in ('character'::public.entity_type, 'location'::public.entity_type)
     and lifecycle_status is not null),
  0::bigint,
  'legacy character and location rows remain lifecycle-free'
);

select ok(
  has_function_privilege('authenticated', 'public.admin_get_map_entity_editor_v7(uuid,text)', 'execute'),
  'authenticated may invoke lifecycle-aware editor read'
);
select ok(
  not has_function_privilege('anon', 'public.admin_get_map_entity_editor_v7(uuid,text)', 'execute'),
  'anon cannot invoke lifecycle-aware editor read'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_save_map_entity_v7(uuid,text,timestamptz,text,text,entity_type,map_visibility,entity_audience,text,text,text,text,jsonb,text,publication_status,text[],jsonb,text[],entity_lifecycle_status)',
    'execute'
  ),
  'authenticated may invoke lifecycle-aware admin save'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.admin_save_map_entity_v7(uuid,text,timestamptz,text,text,entity_type,map_visibility,entity_audience,text,text,text,text,jsonb,text,publication_status,text[],jsonb,text[],entity_lifecycle_status)',
    'execute'
  ),
  'anon cannot invoke lifecycle-aware admin save'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_get_master_catalog_v6(uuid)', 'execute'),
  'authenticated may invoke lifecycle-aware Master catalog'
);
select ok(
  not has_function_privilege('anon', 'public.admin_get_master_catalog_v6(uuid)', 'execute'),
  'anon cannot invoke lifecycle-aware Master catalog'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select ok(
  pg_temp.statement_fails(
    $$update public.map_entities
      set lifecycle_status = null
      where id = 'place-demo-harbor'$$
  ),
  'authenticated non-admin cannot mutate lifecycle directly through the table'
);

reset role;

insert into public.map_entities (
  campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
  x, y, category_id, publication_status
)
select
  '00000000-0000-4000-8000-000000000053',
  fixture.id,
  fixture.slug,
  fixture.entity_type::public.entity_type,
  'pin'::public.map_visibility,
  fixture.audience::public.entity_audience,
  fixture.name,
  'MAP-064 fixture',
  'MAP-064 functional lifecycle fixture',
  fixture.x,
  fixture.y,
  category.id,
  'published'::public.publication_status
from (
  values
    ('entity-map064-mission', 'map064-mission', 'mission', 'public', 'MAP064 PUBLIC MISSION', 900::double precision, 700::double precision),
    ('entity-map064-hazard', 'map064-hazard', 'hazard', 'public', 'MAP064 PUBLIC HAZARD', 910::double precision, 710::double precision),
    ('entity-map064-master-mission', 'map064-master-mission', 'mission', 'master', 'MAP064 MASTER MISSION', 920::double precision, 720::double precision),
    ('entity-map064-master-hazard', 'map064-master-hazard', 'hazard', 'master', 'MAP064 MASTER HAZARD', 930::double precision, 730::double precision)
) as fixture(id, slug, entity_type, audience, name, x, y)
cross join lateral (
  select candidate.id
  from public.categories as candidate
  where candidate.campaign_id = '00000000-0000-4000-8000-000000000053'
    and candidate.publication_status = 'published'::public.publication_status
  order by candidate.id
  limit 1
) as category;

select is(
  (select lifecycle_status::text from public.map_entities where id = 'entity-map064-mission'),
  'active',
  'mission defaults to active lifecycle'
);
select is(
  (select lifecycle_status::text from public.map_entities where id = 'entity-map064-hazard'),
  'active',
  'hazard defaults to active lifecycle'
);

update public.map_entities
set lifecycle_status = 'completed'::public.entity_lifecycle_status
where id = 'entity-map064-mission';
select is(
  (select lifecycle_status::text from public.map_entities where id = 'entity-map064-mission'),
  'completed',
  'mission accepts completed lifecycle'
);
select is(
  (select publication_status::text from public.map_entities where id = 'entity-map064-mission'),
  'published',
  'completing a mission does not archive it'
);

update public.map_entities
set lifecycle_status = 'failed'::public.entity_lifecycle_status
where id = 'entity-map064-mission';
select is(
  (select lifecycle_status::text from public.map_entities where id = 'entity-map064-mission'),
  'failed',
  'mission accepts failed lifecycle'
);
select ok(
  pg_temp.statement_fails(
    $$update public.map_entities
      set lifecycle_status = 'resolved'::public.entity_lifecycle_status
      where id = 'entity-map064-mission'$$
  ),
  'mission rejects hazard-only resolved lifecycle'
);

update public.map_entities
set lifecycle_status = 'resolved'::public.entity_lifecycle_status
where id = 'entity-map064-hazard';
select is(
  (select lifecycle_status::text from public.map_entities where id = 'entity-map064-hazard'),
  'resolved',
  'hazard accepts resolved lifecycle'
);
select is(
  (select publication_status::text from public.map_entities where id = 'entity-map064-hazard'),
  'published',
  'resolving a hazard does not archive it'
);
select ok(
  pg_temp.statement_fails(
    $$update public.map_entities
      set lifecycle_status = 'completed'::public.entity_lifecycle_status
      where id = 'entity-map064-hazard'$$
  ),
  'hazard rejects mission-only completed lifecycle'
);

select ok(
  pg_temp.statement_fails(
    $$update public.map_entities
      set lifecycle_status = 'active'::public.entity_lifecycle_status
      where id = 'entity-aster-guide'$$
  ),
  'character cannot carry functional lifecycle'
);
select ok(
  pg_temp.statement_fails(
    $$update public.map_entities
      set lifecycle_status = 'active'::public.entity_lifecycle_status
      where id = (
        select id
        from public.map_entities
        where entity_type = 'location'::public.entity_type
        order by id
        limit 1
      )$$
  ),
  'location cannot carry functional lifecycle'
);
select ok(
  pg_temp.statement_fails(
    $$update public.map_entities
      set geometry = '{"kind":"polygon","vertices":[{"x":800,"y":600},{"x":1000,"y":600},{"x":900,"y":800}]}'::jsonb
      where id = 'entity-map064-mission'$$
  ),
  'mission remains point-only'
);
select ok(
  pg_temp.statement_fails(
    $$update public.map_entities
      set geometry = '{"kind":"polygon","vertices":[{"x":800,"y":600},{"x":1000,"y":600},{"x":900,"y":800}]}'::jsonb
      where id = 'entity-map064-hazard'$$
  ),
  'hazard remains point-only'
);

reset role;
set local role anon;

select throws_ok(
  $$select public.submit_public_request_v3(
    'malformed', 'Visitor', 'Manipulated mission', 'mission', 100, 100,
    'Mission payload must fail before token parsing.', 'Privilege escalation attempt.', ''
  )$$,
  '22023',
  'invalid public request',
  'public request RPC rejects manipulated mission type before token parsing'
);
select throws_ok(
  $$select public.submit_public_request_v3(
    'malformed', 'Visitor', 'Manipulated hazard', 'hazard', 100, 100,
    'Hazard payload must fail before token parsing.', 'Privilege escalation attempt.', ''
  )$$,
  '22023',
  'invalid public request',
  'public request RPC rejects manipulated hazard type before token parsing'
);
select is(
  (select count(*) from public.map_entities
   where id in ('entity-map064-mission', 'entity-map064-hazard')),
  2::bigint,
  'anon receives published public mission and hazard'
);
select is(
  (select count(*) from public.map_entities
   where id in ('entity-map064-master-mission', 'entity-map064-master-hazard')),
  0::bigint,
  'anon receives no Master mission or hazard'
);

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select ok(
  pg_temp.statement_fails(
    $$select public.admin_get_master_catalog_v6('00000000-0000-4000-8000-000000000053'::uuid)$$
  ),
  'authenticated non-admin cannot read lifecycle-aware Master content'
);

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select ok(
  position(
    'MAP064 MASTER MISSION'
    in public.admin_get_master_catalog_v6('00000000-0000-4000-8000-000000000053'::uuid)::text
  ) > 0
  and position(
    'MAP064 MASTER HAZARD'
    in public.admin_get_master_catalog_v6('00000000-0000-4000-8000-000000000053'::uuid)::text
  ) > 0,
  'authorized Master catalog returns mission and hazard with private audience'
);

select * from finish();
rollback;
