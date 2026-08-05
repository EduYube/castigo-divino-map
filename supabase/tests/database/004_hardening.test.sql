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

select plan(19);

select ok(
  not exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name = any (
        array[
          'categories',
          'tags',
          'map_entities',
          'players',
          'entity_aliases',
          'entity_tags',
          'public_notes',
          'public_note_tags',
          'geographic_names',
          'geographic_name_aliases',
          'character_location_events'
        ]
      )
      and privilege_type in ('INSERT', 'UPDATE')
  ),
  'browser administration uses explicit column grants instead of broad write grants'
);

select ok(
  not exists (
    select 1
    from information_schema.column_privileges
    where grantee = 'authenticated'
      and table_schema = 'public'
      and privilege_type = 'INSERT'
      and column_name = any (
        array[
          'normalized_name',
          'normalized_value',
          'published_at',
          'archived_at',
          'created_at',
          'updated_at'
        ]
      )
  ),
  'browser inserts cannot forge normalized or lifecycle-managed columns'
);

select ok(
  not exists (
    select 1
    from information_schema.column_privileges
    where grantee = 'authenticated'
      and table_schema = 'public'
      and privilege_type = 'UPDATE'
      and column_name = any (
        array[
          'id',
          'entity_type',
          'normalized_name',
          'normalized_value',
          'published_at',
          'archived_at',
          'created_at',
          'updated_at',
          'moderator_user_id',
          'moderated_at'
        ]
      )
  ),
  'browser updates cannot rewrite identifiers, types, normalization, or audit columns'
);

select is(
  (
    select array_agg(column_name order by column_name)::text[]
    from information_schema.column_privileges
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name = 'entity_player_dispositions'
      and privilege_type = 'UPDATE'
  ),
  array['disposition']::text[],
  'the entity-player matrix only exposes disposition updates'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

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
  'Isolated published delete',
  20,
  20,
  'category-hardening-test',
  'published'
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
  'Isolated former delete',
  30,
  30,
  'category-hardening-test',
  'published'
);

update public.map_entities
set publication_status = 'draft'
where id = 'entity-isolated-former-delete';

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

select throws_ok(
  $$update public.entity_tags
    set entity_id = 'entity-bramble-fort'
    where id = 'entity-tag-aster-notable'$$,
  '23514',
  'published relation identity is immutable',
  'published relation endpoints cannot be silently rewritten'
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

select throws_ok(
  $$delete from public.public_requests
    where id = '10000000-0000-4000-8000-000000000001'$$,
  '23514',
  'moderated public requests cannot be physically deleted',
  'moderated requests preserve their audit trail'
);

insert into public.public_requests (
  id,
  sender_name,
  proposed_name,
  entity_type,
  x,
  y,
  description,
  reason
)
values (
  '10000000-0000-4000-8000-000000000099',
  'Disposable Visitor',
  'Disposable Draft',
  'location',
  1,
  1,
  'A never-moderated request.',
  'Exercises allowed draft cleanup.'
);

select lives_ok(
  $$delete from public.public_requests
    where id = '10000000-0000-4000-8000-000000000099'$$,
  'a never-moderated pending request may be deleted'
);

select is(
  pg_temp.sqlstate_for(
    $$insert into public.entity_player_dispositions (
      entity_id,
      player_id,
      disposition
    ) values (
      'entity-aster-guide',
      'player-demo-one',
      'neutral'
    )$$
  ),
  '42501',
  'the browser cannot insert or replace entity-player matrix rows'
);

select is(
  pg_temp.sqlstate_for(
    $$delete from public.entity_player_dispositions
      where entity_id = 'entity-aster-guide'
        and player_id = 'player-demo-one'$$
  ),
  '42501',
  'the browser cannot delete entity-player matrix rows'
);

select * from finish();
rollback;
