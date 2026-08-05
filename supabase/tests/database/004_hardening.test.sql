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

select plan(27);

select ok(
  not has_column_privilege('authenticated', 'public.categories', 'created_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.categories', 'created_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.categories', 'updated_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.categories', 'updated_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.categories', 'published_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.categories', 'published_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.categories', 'archived_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.categories', 'archived_at', 'UPDATE'),
  'authenticated cannot supply category system timestamps'
);

select ok(
  not has_column_privilege('authenticated', 'public.tags', 'created_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.tags', 'created_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.tags', 'updated_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.tags', 'updated_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.tags', 'published_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.tags', 'published_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.tags', 'archived_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.tags', 'archived_at', 'UPDATE'),
  'authenticated cannot supply tag system timestamps'
);

select ok(
  not has_column_privilege('authenticated', 'public.map_entities', 'normalized_name', 'INSERT')
  and not has_column_privilege('authenticated', 'public.map_entities', 'normalized_name', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.map_entities', 'entity_type', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.map_entities', 'created_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.map_entities', 'created_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.map_entities', 'updated_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.map_entities', 'updated_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.map_entities', 'published_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.map_entities', 'published_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.map_entities', 'archived_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.map_entities', 'archived_at', 'UPDATE'),
  'authenticated cannot supply entity derived or system columns'
);

select ok(
  not has_column_privilege('authenticated', 'public.entity_aliases', 'normalized_value', 'INSERT')
  and not has_column_privilege('authenticated', 'public.entity_aliases', 'normalized_value', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.entity_aliases', 'created_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.entity_aliases', 'created_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.entity_aliases', 'updated_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.entity_aliases', 'updated_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.entity_aliases', 'published_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.entity_aliases', 'published_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.entity_aliases', 'archived_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.entity_aliases', 'archived_at', 'UPDATE'),
  'authenticated cannot supply alias derived or system columns'
);

select ok(
  not has_column_privilege('authenticated', 'public.entity_tags', 'created_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.entity_tags', 'created_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.entity_tags', 'updated_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.entity_tags', 'updated_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.entity_tags', 'published_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.entity_tags', 'published_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.entity_tags', 'archived_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.entity_tags', 'archived_at', 'UPDATE'),
  'authenticated cannot supply entity-tag system timestamps'
);

select ok(
  not has_column_privilege('authenticated', 'public.public_notes', 'created_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.public_notes', 'created_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.public_notes', 'updated_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.public_notes', 'updated_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.public_notes', 'published_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.public_notes', 'published_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.public_notes', 'archived_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.public_notes', 'archived_at', 'UPDATE'),
  'authenticated cannot supply note system timestamps'
);

select ok(
  not has_column_privilege('authenticated', 'public.character_locations', 'created_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.character_locations', 'created_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.character_locations', 'updated_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.character_locations', 'updated_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.character_locations', 'published_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.character_locations', 'published_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.character_locations', 'archived_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.character_locations', 'archived_at', 'UPDATE'),
  'authenticated cannot supply relation system timestamps'
);

select ok(
  not has_column_privilege('authenticated', 'public.geographic_names', 'normalized_name', 'INSERT')
  and not has_column_privilege('authenticated', 'public.geographic_names', 'normalized_name', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.geographic_names', 'created_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.geographic_names', 'created_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.geographic_names', 'updated_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.geographic_names', 'updated_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.geographic_names', 'published_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.geographic_names', 'published_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.geographic_names', 'archived_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.geographic_names', 'archived_at', 'UPDATE'),
  'authenticated cannot supply geographic-name derived or system columns'
);

select ok(
  not has_column_privilege('authenticated', 'public.public_requests', 'sender_name', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.public_requests', 'proposed_name', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.public_requests', 'entity_type', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.public_requests', 'x', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.public_requests', 'y', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.public_requests', 'description', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.public_requests', 'reason', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.public_requests', 'moderator_user_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.public_requests', 'moderated_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.public_requests', 'created_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.public_requests', 'updated_at', 'UPDATE'),
  'authenticated can update only closed moderation inputs'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select is(
  pg_temp.sqlstate_for(
    $$insert into public.categories (
      id, slug, name, created_at
    ) values (
      'category-protected-created-at',
      'protected-created-at',
      'Protected created at',
      '2000-01-01T00:00:00Z'
    )$$
  ),
  '42501',
  'category created_at insert is denied with insufficient privilege'
);

select is(
  pg_temp.sqlstate_for(
    $$update public.categories
      set updated_at = '2000-01-01T00:00:00Z'
      where id = 'category-people'$$
  ),
  '42501',
  'category updated_at update is denied with insufficient privilege'
);

select is(
  pg_temp.sqlstate_for(
    $$update public.categories
      set published_at = '2000-01-01T00:00:00Z'
      where id = 'category-people'$$
  ),
  '42501',
  'category published_at update is denied with insufficient privilege'
);

select is(
  pg_temp.sqlstate_for(
    $$insert into public.map_entities (
      id,
      slug,
      entity_type,
      disposition,
      name,
      normalized_name,
      x,
      y,
      category_id
    ) values (
      'entity-protected-normalized',
      'protected-normalized',
      'character',
      'unknown',
      'Protected normalized',
      'forged normalized value',
      10,
      10,
      'category-people'
    )$$
  ),
  '42501',
  'entity normalized_name insert is denied with insufficient privilege'
);

select is(
  pg_temp.sqlstate_for(
    $$update public.public_requests
      set moderator_user_id = '00000000-0000-4000-8000-000000000002'
      where id = '10000000-0000-4000-8000-000000000001'$$
  ),
  '42501',
  'request moderator identity update is denied with insufficient privilege'
);

select is(
  pg_temp.sqlstate_for(
    $$update public.public_requests
      set moderated_at = '2000-01-01T00:00:00Z'
      where id = '10000000-0000-4000-8000-000000000001'$$
  ),
  '42501',
  'request moderation timestamp update is denied with insufficient privilege'
);

insert into public.categories (id, slug, name)
values ('category-hardening-test', 'hardening-test', 'Hardening test');

select ok(
  exists (
    select 1
    from public.categories
    where id = 'category-hardening-test'
      and publication_status = 'draft'
  ),
  'administrator can still insert allowed category columns'
);

update public.categories
set publication_status = 'published'
where id = 'category-hardening-test';

select ok(
  exists (
    select 1
    from public.categories
    where id = 'category-hardening-test'
      and publication_status = 'published'
      and published_at is not null
  ),
  'first publication assigns published_at in the database'
);

insert into public.map_entities (
  id,
  slug,
  entity_type,
  disposition,
  name,
  x,
  y,
  category_id,
  publication_status
)
values (
  'entity-isolated-published-delete',
  'isolated-published-delete',
  'character',
  'unknown',
  'Isolated published delete',
  20,
  20,
  'category-hardening-test',
  'published'
);

select ok(
  exists (
    select 1
    from public.map_entities
    where id = 'entity-isolated-published-delete'
      and published_at is not null
  ),
  'isolated published entity exists without dependent child rows'
);

select throws_ok(
  $$delete from public.map_entities
    where id = 'entity-isolated-published-delete'$$,
  '23514',
  'published content cannot be physically deleted by the application',
  'published deletion is rejected by the lifecycle trigger itself'
);

insert into public.map_entities (
  id,
  slug,
  entity_type,
  disposition,
  name,
  x,
  y,
  category_id,
  publication_status
)
values (
  'entity-isolated-former-delete',
  'isolated-former-delete',
  'character',
  'unknown',
  'Isolated former delete',
  30,
  30,
  'category-hardening-test',
  'published'
);

update public.map_entities
set publication_status = 'draft'
where id = 'entity-isolated-former-delete';

select ok(
  exists (
    select 1
    from public.map_entities
    where id = 'entity-isolated-former-delete'
      and publication_status = 'draft'
      and published_at is not null
  ),
  'formerly published entity retains its publication timestamp'
);

select throws_ok(
  $$delete from public.map_entities
    where id = 'entity-isolated-former-delete'$$,
  '23514',
  'published content cannot be physically deleted by the application',
  'formerly published deletion is rejected by the lifecycle trigger itself'
);

select throws_ok(
  $$update public.map_entities
    set publication_status = 'published'
    where id = 'entity-dawn-envoy'$$,
  '23514',
  'archived content must return to draft before publication',
  'archived content cannot bypass draft review'
);

reset role;

insert into public.categories (
  id,
  slug,
  name,
  publication_status,
  published_at
)
values (
  'category-forged-publication-time',
  'forged-publication-time',
  'Forged publication time',
  'published',
  '2000-01-01T00:00:00Z'
);

select isnt(
  (
    select published_at
    from public.categories
    where id = 'category-forged-publication-time'
  ),
  '2000-01-01T00:00:00Z'::timestamp with time zone,
  'publication trigger overwrites a supplied first-publication timestamp'
);

insert into public.categories (
  id,
  slug,
  name,
  publication_status,
  published_at
)
values (
  'category-forged-draft-time',
  'forged-draft-time',
  'Forged draft time',
  'draft',
  '2000-01-01T00:00:00Z'
);

select is(
  (
    select published_at
    from public.categories
    where id = 'category-forged-draft-time'
  ),
  null::timestamp with time zone,
  'draft insertion clears a supplied publication timestamp'
);

update public.public_requests
set
  request_status = 'accepted',
  moderator_user_id = '00000000-0000-4000-8000-000000000002',
  moderated_at = '2000-01-01T00:00:00Z'
where id = '10000000-0000-4000-8000-000000000001';

select is(
  (
    select moderator_user_id
    from public.public_requests
    where id = '10000000-0000-4000-8000-000000000001'
  ),
  '00000000-0000-4000-8000-000000000001'::uuid,
  'request transition always records auth.uid as moderator'
);

select isnt(
  (
    select moderated_at
    from public.public_requests
    where id = '10000000-0000-4000-8000-000000000001'
  ),
  '2000-01-01T00:00:00Z'::timestamp with time zone,
  'request transition always records the database moderation time'
);

select is(
  (
    select request_status
    from public.public_requests
    where id = '10000000-0000-4000-8000-000000000001'
  ),
  'accepted'::public.request_status,
  'valid request transition still succeeds after moderation hardening'
);

select * from finish();
rollback;
