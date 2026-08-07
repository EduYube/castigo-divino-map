begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create function pg_temp.sqlstate_for(statement text)
returns text
language plpgsql
as $$
begin
  execute statement;
  return null;
exception
  when others then
    return sqlstate;
end;
$$;

select plan(18);

set local role anon;
select is(
  (select count(*) from public.categories where id = 'category-draft'),
  0::bigint,
  'anonymous readers cannot see draft categories'
);
select is(
  (select count(*) from public.categories where id = 'category-places'),
  1::bigint,
  'anonymous readers can see published categories'
);
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select is(
  pg_temp.sqlstate_for(
    $$insert into public.categories (id, slug, name)
      values ('category-map018-denied', 'map018-denied', 'MAP-018 denied')$$
  ),
  '42501',
  'authenticated non-admin cannot create categories'
);
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$insert into public.categories (id, slug, name, description, publication_status)
    values ('category-map018', 'map018', 'MAP-018 category', 'Temporary pgTAP row.', 'draft')$$,
  'administrator can create a draft category through the browser grant surface'
);

select lives_ok(
  $$update public.categories
    set publication_status = 'published'
    where id = 'category-map018'$$,
  'administrator can publish a valid category'
);

select ok(
  (select published_at is not null from public.categories where id = 'category-map018'),
  'publication assigns immutable publication history'
);

select throws_ok(
  $$delete from public.categories where id = 'category-map018'$$,
  '23514',
  'published content cannot be physically deleted by the application',
  'published category cannot be physically deleted'
);

select lives_ok(
  $$insert into public.categories (id, slug, name, publication_status)
    values ('category-map018-disposable', 'map018-disposable', 'Disposable category', 'draft')$$,
  'administrator can create a never-published draft for cleanup testing'
);

select lives_ok(
  $$delete from public.categories where id = 'category-map018-disposable'$$,
  'never-published unreferenced category can be physically deleted'
);

select throws_ok(
  $$update public.categories
    set publication_status = 'archived'
    where id = 'category-places'$$,
  '23514',
  'a category used by published entities cannot be withdrawn',
  'category archivado is blocked while published entities depend on it'
);

select throws_ok(
  $$update public.tags
    set publication_status = 'archived'
    where id = 'notable'$$,
  '23514',
  'a tag used by published relations cannot be withdrawn',
  'tag archivado is blocked while published relations depend on it'
);

select throws_ok(
  $$insert into public.entity_aliases (
      id, entity_id, language, value, publication_status
    ) values (
      'alias-map018-main-collision', 'entity-aster-guide', 'en', 'Aster Guide', 'published'
    )$$,
  '23505',
  'published names and aliases must be unambiguous',
  'published entity alias cannot collide with a published primary entity name'
);

select throws_ok(
  $$insert into public.geographic_name_aliases (
      id, geographic_name_id, language, value, publication_status
    ) values (
      'geo-alias-map018-main-collision', 'geo-silver-crossing', 'en', 'Silver Crossing', 'published'
    )$$,
  '23505',
  'published geographic names and aliases must be unambiguous',
  'published geographic alias cannot collide with a primary geographic name'
);

select throws_ok(
  $$insert into public.geographic_names (
      id, slug, name, language, x, y, publication_status
    ) values (
      'geo-map018-alias-collision', 'map018-alias-collision', 'The Crossing', 'en', 1, 1, 'published'
    )$$,
  '23505',
  'published geographic names and aliases must be unambiguous',
  'published geographic primary name cannot collide with a published alias'
);

select is(
  pg_temp.sqlstate_for(
    $$delete from public.geographic_names where id = 'geo-echo-trail'$$
  ),
  '23503',
  'foreign keys prevent physical deletion while aliases still reference the name'
);

select lives_ok(
  $$update public.entity_aliases
    set value = 'The Very Quiet Wanderer'
    where id = 'alias-echo-draft'$$,
  'administrator can edit a draft alternate entity name'
);

reset role;
set local role anon;
select is(
  (select count(*) from public.entity_aliases where id = 'alias-aster-lantern'),
  1::bigint,
  'published alternate entity names are exposed through the public projection'
);
select is(
  (select count(*) from public.entity_aliases where id = 'alias-echo-draft'),
  0::bigint,
  'draft alternate entity names are not exposed through the public projection'
);
reset role;

select ok(
  has_table_privilege('authenticated', 'public.categories', 'delete')
    and has_table_privilege('authenticated', 'public.tags', 'delete')
    and has_table_privilege('authenticated', 'public.entity_aliases', 'delete')
    and has_table_privilege('authenticated', 'public.geographic_names', 'delete')
    and has_table_privilege('authenticated', 'public.geographic_name_aliases', 'delete'),
  'authenticated role has only the table delete surface later constrained by RLS and PostgreSQL invariants'
);

select * from finish();
rollback;
