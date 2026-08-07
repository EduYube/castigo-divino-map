begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

select has_table(
  'public',
  'character_location_relations',
  'MAP-020 stores character-location relations in one normalized table'
);
select col_is_pk(
  'public',
  'character_location_relations',
  array['character_id', 'location_id'],
  'the character-location pair is the primary key and prevents duplicates'
);
select enum_has_labels(
  'public',
  'character_location_relation_status',
  array['present', 'associated', 'last-seen'],
  'only the three public relationship states are valid'
);
select ok(
  has_column_privilege('anon', 'public.character_location_relations', 'relation_status', 'select'),
  'anonymous readers may select the public relation state'
);
select ok(
  not has_column_privilege('anon', 'public.character_location_relations', 'updated_at', 'select'),
  'anonymous readers cannot select administrative timestamps'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$insert into public.character_location_relations (
      character_id, location_id, relation_status, publication_status
    ) values ('entity-aster-guide', 'entity-bramble-fort', 'present', 'draft')$$,
  '42501',
  null,
  'an authenticated non-admin cannot create relations'
);
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$insert into public.character_location_relations (
      character_id, location_id, relation_status, publication_status
    ) values ('entity-aster-guide', 'entity-bramble-fort', 'associated', 'draft')$$,
  'an administrator can create a valid draft relation'
);
select throws_ok(
  $$insert into public.character_location_relations (
      character_id, location_id, relation_status, publication_status
    ) values ('entity-aster-guide', 'entity-bramble-fort', 'last-seen', 'draft')$$,
  '23505',
  null,
  'the primary key rejects duplicate character-location pairs'
);
select throws_ok(
  $$insert into public.character_location_relations (
      character_id, location_id, relation_status, publication_status
    ) values ('entity-bramble-fort', 'entity-aster-guide', 'associated', 'draft')$$,
  '23514',
  'character-location relation requires a character endpoint',
  'the database rejects incompatible endpoint types'
);
select throws_ok(
  $$insert into public.character_location_relations (
      character_id, location_id, relation_status, publication_status
    ) values ('entity-dawn-envoy', 'entity-bramble-fort', 'associated', 'draft')$$,
  '23514',
  'character-location relation cannot reference archived endpoints',
  'the database rejects archived endpoints'
);
select throws_ok(
  $$insert into public.character_location_relations (
      character_id, location_id, relation_status, publication_status
    ) values ('entity-echo-wanderer', 'entity-bramble-fort', 'associated', 'published')$$,
  '23514',
  'published character-location relation requires published endpoints',
  'publishing requires both endpoints to be public'
);

update public.character_location_relations
set publication_status = 'published'
where character_id = 'entity-aster-guide'
  and location_id = 'entity-bramble-fort';
select ok(
  (select published_at is not null
   from public.character_location_relations
   where character_id = 'entity-aster-guide' and location_id = 'entity-bramble-fort'),
  'publishing records the first publication timestamp'
);
select lives_ok(
  $$update public.character_location_relations
    set relation_status = 'last-seen'
    where character_id = 'entity-aster-guide' and location_id = 'entity-bramble-fort'$$,
  'a published relation state may be updated explicitly'
);
select is(
  (select relation_status::text
   from public.character_location_relations
   where character_id = 'entity-aster-guide' and location_id = 'entity-bramble-fort'),
  'last-seen',
  'the updated public relation state is stored once'
);
reset role;

set local role anon;
select is(
  (select count(character_id)
   from public.character_location_relations
   where character_id = 'entity-aster-guide' and location_id = 'entity-bramble-fort'),
  1::bigint,
  'anon can read a published relation with published endpoints'
);
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$update public.map_entities
    set publication_status = 'archived'
    where id = 'entity-bramble-fort'$$,
  '23514',
  'active character-location relations must be retired before archiving the entity',
  'an endpoint cannot be archived while an active relation exists'
);
select is(
  (
    with deleted as (
      delete from public.character_location_relations
      where character_id = 'entity-aster-guide' and location_id = 'entity-bramble-fort'
      returning character_id
    )
    select count(*) from deleted
  ),
  0::bigint,
  'RLS prevents physical deletion after first publication'
);
select lives_ok(
  $$update public.character_location_relations
    set publication_status = 'archived'
    where character_id = 'entity-aster-guide' and location_id = 'entity-bramble-fort'$$,
  'an administrator retires a relation by archiving it'
);
select lives_ok(
  $$update public.map_entities
    set publication_status = 'archived'
    where id = 'entity-bramble-fort'$$,
  'an endpoint can be archived after all active relations are explicitly retired'
);
reset role;

set local role anon;
select is(
  (select count(character_id)
   from public.character_location_relations
   where character_id = 'entity-aster-guide' and location_id = 'entity-bramble-fort'),
  0::bigint,
  'retired relations disappear from the anonymous projection'
);
reset role;

select ok(
  (select relrowsecurity from pg_class where oid = 'public.character_location_relations'::regclass),
  'RLS is enabled on the relation table'
);
select is(
  (
    select count(*)
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'validate_character_location_relation'
  ),
  0::bigint,
  'the internal validation function is not exposed from the public schema'
);

select * from finish();
rollback;
