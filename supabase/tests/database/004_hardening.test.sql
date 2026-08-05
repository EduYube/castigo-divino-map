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

select plan(103);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select is(
  pg_temp.sqlstate_for(
    format(
      'insert into %s (%I) values (null)',
      protected_column.relation_name,
      protected_column.column_name
    )
  ),
  '42501',
  format(
    '%s.%s insert is denied with insufficient privilege',
    protected_column.relation_name,
    protected_column.column_name
  )
)
from (
  values
    ('public.categories', 'published_at'),
    ('public.categories', 'archived_at'),
    ('public.categories', 'created_at'),
    ('public.categories', 'updated_at'),
    ('public.tags', 'published_at'),
    ('public.tags', 'archived_at'),
    ('public.tags', 'created_at'),
    ('public.tags', 'updated_at'),
    ('public.map_entities', 'normalized_name'),
    ('public.map_entities', 'published_at'),
    ('public.map_entities', 'archived_at'),
    ('public.map_entities', 'created_at'),
    ('public.map_entities', 'updated_at'),
    ('public.entity_aliases', 'normalized_value'),
    ('public.entity_aliases', 'published_at'),
    ('public.entity_aliases', 'archived_at'),
    ('public.entity_aliases', 'created_at'),
    ('public.entity_aliases', 'updated_at'),
    ('public.entity_tags', 'published_at'),
    ('public.entity_tags', 'archived_at'),
    ('public.entity_tags', 'created_at'),
    ('public.entity_tags', 'updated_at'),
    ('public.public_notes', 'published_at'),
    ('public.public_notes', 'archived_at'),
    ('public.public_notes', 'created_at'),
    ('public.public_notes', 'updated_at'),
    ('public.character_locations', 'published_at'),
    ('public.character_locations', 'archived_at'),
    ('public.character_locations', 'created_at'),
    ('public.character_locations', 'updated_at'),
    ('public.geographic_names', 'normalized_name'),
    ('public.geographic_names', 'published_at'),
    ('public.geographic_names', 'archived_at'),
    ('public.geographic_names', 'created_at'),
    ('public.geographic_names', 'updated_at')
) as protected_column(relation_name, column_name);

select is(
  pg_temp.sqlstate_for(
    format(
      'update %s set %I = null where false',
      protected_column.relation_name,
      protected_column.column_name
    )
  ),
  '42501',
  format(
    '%s.%s update is denied with insufficient privilege',
    protected_column.relation_name,
    protected_column.column_name
  )
)
from (
  values
    ('public.categories', 'id'),
    ('public.categories', 'published_at'),
    ('public.categories', 'archived_at'),
    ('public.categories', 'created_at'),
    ('public.categories', 'updated_at'),
    ('public.tags', 'id'),
    ('public.tags', 'published_at'),
    ('public.tags', 'archived_at'),
    ('public.tags', 'created_at'),
    ('public.tags', 'updated_at'),
    ('public.map_entities', 'id'),
    ('public.map_entities', 'entity_type'),
    ('public.map_entities', 'normalized_name'),
    ('public.map_entities', 'published_at'),
    ('public.map_entities', 'archived_at'),
    ('public.map_entities', 'created_at'),
    ('public.map_entities', 'updated_at'),
    ('public.entity_aliases', 'id'),
    ('public.entity_aliases', 'normalized_value'),
    ('public.entity_aliases', 'published_at'),
    ('public.entity_aliases', 'archived_at'),
    ('public.entity_aliases', 'created_at'),
    ('public.entity_aliases', 'updated_at'),
    ('public.entity_tags', 'id'),
    ('public.entity_tags', 'published_at'),
    ('public.entity_tags', 'archived_at'),
    ('public.entity_tags', 'created_at'),
    ('public.entity_tags', 'updated_at'),
    ('public.public_notes', 'id'),
    ('public.public_notes', 'published_at'),
    ('public.public_notes', 'archived_at'),
    ('public.public_notes', 'created_at'),
    ('public.public_notes', 'updated_at'),
    ('public.character_locations', 'id'),
    ('public.character_locations', 'published_at'),
    ('public.character_locations', 'archived_at'),
    ('public.character_locations', 'created_at'),
    ('public.character_locations', 'updated_at'),
    ('public.geographic_names', 'id'),
    ('public.geographic_names', 'normalized_name'),
    ('public.geographic_names', 'published_at'),
    ('public.geographic_names', 'archived_at'),
    ('public.geographic_names', 'created_at'),
    ('public.geographic_names', 'updated_at'),
    ('public.public_requests', 'id'),
    ('public.public_requests', 'sender_name'),
    ('public.public_requests', 'proposed_name'),
    ('public.public_requests', 'entity_type'),
    ('public.public_requests', 'x'),
    ('public.public_requests', 'y'),
    ('public.public_requests', 'description'),
    ('public.public_requests', 'reason'),
    ('public.public_requests', 'moderator_user_id'),
    ('public.public_requests', 'moderated_at'),
    ('public.public_requests', 'created_at'),
    ('public.public_requests', 'updated_at')
) as protected_column(relation_name, column_name);

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
