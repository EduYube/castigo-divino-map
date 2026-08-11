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

create function pg_temp.statement_affected_rows(statement text)
returns bigint
language plpgsql
as $$
declare
  affected_rows bigint;
begin
  execute statement;
  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

select plan(24);

select is(
  (select is_nullable from information_schema.columns
   where table_schema = 'public' and table_name = 'map_entities' and column_name = 'portrait_path'),
  'YES',
  'portrait_path is nullable for all existing entities'
);

select ok(
  exists(
    select 1 from storage.buckets
    where id = 'character-portraits'
      and public = false
      and file_size_limit = 4194304
      and allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[]
  ),
  'character portrait bucket is private, bounded and raster-only'
);

select ok(
  has_function_privilege('authenticated', 'public.admin_get_map_entity_editor_v3(text)', 'execute'),
  'authenticated role can invoke the RLS-protected v3 editor contract'
);
select ok(
  not has_function_privilege('anon', 'public.admin_get_map_entity_editor_v3(text)', 'execute'),
  'anon cannot invoke the v3 editor contract'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_get_master_catalog_v2()', 'execute'),
  'authenticated role can invoke the RLS-protected master catalog v2'
);
select ok(
  not has_function_privilege('anon', 'public.admin_get_master_catalog_v2()', 'execute'),
  'anon cannot invoke master catalog v2'
);

insert into public.map_entities (
  id, slug, entity_type, visibility, audience, portrait_path, name, summary, description,
  x, y, category_id, publication_status
)
select
  valueset.id, valueset.slug, 'character', 'pin', valueset.audience::public.entity_audience,
  valueset.portrait_path, valueset.name, '', '', valueset.x, valueset.y, category.id,
  valueset.status::public.publication_status
from (
  values
    ('entity-map045-public', 'map045-public', 'public', 'portraits/11111111-1111-4111-8111-111111111111.webp', 'MAP045 PUBLIC', 401::double precision, 501::double precision, 'published'),
    ('entity-map045-master', 'map045-master', 'master', 'portraits/22222222-2222-4222-8222-222222222222.webp', 'MAP045 MASTER', 402::double precision, 502::double precision, 'published'),
    ('entity-map045-draft', 'map045-draft', 'public', 'portraits/33333333-3333-4333-8333-333333333333.webp', 'MAP045 DRAFT', 403::double precision, 503::double precision, 'draft'),
    ('entity-map045-archived', 'map045-archived', 'public', 'portraits/44444444-4444-4444-8444-444444444444.webp', 'MAP045 ARCHIVED', 404::double precision, 504::double precision, 'archived')
) as valueset(id, slug, audience, portrait_path, name, x, y, status)
cross join lateral (
  select id from public.categories where publication_status = 'published' order by id limit 1
) as category;

select ok(
  pg_temp.statement_fails($sql$
    insert into public.map_entities (
      id, slug, entity_type, visibility, audience, portrait_path, name, summary, description,
      x, y, category_id, publication_status
    )
    select 'place-map045-invalid', 'map045-invalid-location', 'location', 'pin', 'public',
      'portraits/55555555-5555-4555-8555-555555555555.webp', 'INVALID', '', '', 405, 505,
      id, 'draft'
    from public.categories where publication_status = 'published' order by id limit 1
  $sql$),
  'a location cannot reference a character portrait'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

insert into storage.objects (bucket_id, name, metadata)
values
  ('character-portraits', 'portraits/11111111-1111-4111-8111-111111111111.webp', '{"mimetype":"image/webp"}'::jsonb),
  ('character-portraits', 'portraits/22222222-2222-4222-8222-222222222222.webp', '{"mimetype":"image/webp"}'::jsonb),
  ('character-portraits', 'portraits/33333333-3333-4333-8333-333333333333.webp', '{"mimetype":"image/webp"}'::jsonb),
  ('character-portraits', 'portraits/44444444-4444-4444-8444-444444444444.webp', '{"mimetype":"image/webp"}'::jsonb),
  ('character-portraits', 'portraits/99999999-9999-4999-8999-999999999999.webp', '{"mimetype":"image/webp"}'::jsonb);

select is(
  (select count(*) from storage.objects where bucket_id = 'character-portraits'),
  5::bigint,
  'admin may upload portrait objects, including an unreferenced cleanup canary'
);
select ok(
  (public.admin_get_map_entity_editor_v3('entity-map045-master') -> 'record' ->> 'portrait_path') like 'portraits/%',
  'admin editor receives the current portrait reference'
);
select ok(
  public.admin_get_master_catalog_v2()::text like '%22222222-2222-4222-8222-222222222222.webp%',
  'authorized master catalog includes the master portrait reference'
);

reset role;
set local role anon;

select is(
  (select count(*) from storage.objects
   where bucket_id = 'character-portraits'
     and name = 'portraits/11111111-1111-4111-8111-111111111111.webp'),
  1::bigint,
  'anon can read the referenced portrait of a published public character'
);
select is(
  (select count(*) from storage.objects
   where bucket_id = 'character-portraits'
     and name = 'portraits/22222222-2222-4222-8222-222222222222.webp'),
  0::bigint,
  'anon cannot read a master portrait'
);
select is(
  (select count(*) from storage.objects
   where bucket_id = 'character-portraits'
     and name in (
       'portraits/33333333-3333-4333-8333-333333333333.webp',
       'portraits/44444444-4444-4444-8444-444444444444.webp'
     )),
  0::bigint,
  'draft and archived portraits are not public'
);
select is(
  (select count(*) from storage.objects
   where bucket_id = 'character-portraits'
     and name = 'portraits/99999999-9999-4999-8999-999999999999.webp'),
  0::bigint,
  'an orphan object without an entity reference is not public'
);
select ok(
  pg_temp.statement_fails($sql$
    insert into storage.objects (bucket_id, name, metadata)
    values ('character-portraits', 'portraits/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp', '{"mimetype":"image/webp"}'::jsonb)
  $sql$),
  'anon cannot upload portrait objects'
);
select is(
  pg_temp.statement_affected_rows($sql$
    delete from storage.objects
    where bucket_id = 'character-portraits'
      and name = 'portraits/11111111-1111-4111-8111-111111111111.webp'
  $sql$),
  0::bigint,
  'anon cannot delete portrait objects'
);

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select is((select private.is_admin()), false, 'non-admin fixture remains non-admin');
select is(
  (select count(*) from storage.objects
   where bucket_id = 'character-portraits'
     and name = 'portraits/22222222-2222-4222-8222-222222222222.webp'),
  0::bigint,
  'authenticated non-admin cannot read master portrait data'
);
select ok(
  pg_temp.statement_fails($sql$
    insert into storage.objects (bucket_id, name, metadata)
    values ('character-portraits', 'portraits/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp', '{"mimetype":"image/webp"}'::jsonb)
  $sql$),
  'authenticated non-admin cannot upload portraits'
);
select is(
  pg_temp.statement_affected_rows($sql$
    update public.map_entities
    set portrait_path = 'portraits/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp'
    where id = 'entity-map045-public'
  $sql$),
  0::bigint,
  'authenticated non-admin cannot mutate a public portrait reference directly'
);

select ok(
  pg_temp.statement_fails($$select public.admin_get_map_entity_editor_v3('entity-map045-master')$$),
  'authenticated non-admin cannot use v3 editor to discover portrait paths'
);

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

update public.map_entities set audience = 'master' where id = 'entity-map045-public';

reset role;
set local role anon;
select is(
  (select count(*) from storage.objects
   where bucket_id = 'character-portraits'
     and name = 'portraits/11111111-1111-4111-8111-111111111111.webp'),
  0::bigint,
  'public to master revokes anonymous portrait access immediately'
);

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
update public.map_entities set audience = 'public' where id = 'entity-map045-master';

reset role;
set local role anon;
select is(
  (select count(*) from storage.objects
   where bucket_id = 'character-portraits'
     and name = 'portraits/22222222-2222-4222-8222-222222222222.webp'),
  1::bigint,
  'master to public enables portrait access only after entity publication permits it'
);

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select is(
  pg_temp.statement_affected_rows($sql$
    delete from storage.objects
    where bucket_id = 'character-portraits'
      and name = 'portraits/99999999-9999-4999-8999-999999999999.webp'
  $sql$),
  1::bigint,
  'admin can delete an orphaned portrait object through Storage RLS'
);

select * from finish();
rollback;
