begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temporary table _map_014_test_helpers (id integer);

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

create function pg_temp.statement_succeeds(statement text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return true;
exception
  when others then
    return false;
end;
$$;

select plan(37);

select is(
  (select count(*) from auth.users where email like '%@example.invalid'),
  2::bigint,
  'two fictitious Auth users are seeded'
);

select is(
  (select count(*) from private.admin_users),
  1::bigint,
  'exactly one fictitious local administrator is allowlisted'
);

select is(
  (
    select raw_user_meta_data ->> 'role'
    from auth.users
    where id = '00000000-0000-4000-8000-000000000002'
  ),
  'admin',
  'the non-admin seed deliberately carries editable admin-like metadata'
);

select is(
  (select count(*) from public.public_requests),
  1::bigint,
  'one deterministic pending request is seeded'
);

set local role anon;

select is((select count(*) from public.map_entities), 2::bigint, 'anon sees only published entities');
select is((select count(*) from public.categories), 2::bigint, 'anon sees only published categories');
select is((select count(*) from public.tags), 1::bigint, 'anon sees only published tags');
select is((select count(*) from public.entity_aliases), 1::bigint, 'anon does not see aliases of withdrawn entities');
select is((select count(*) from public.entity_tags), 1::bigint, 'anon does not see tag relations of withdrawn entities');
select is((select count(*) from public.public_notes), 1::bigint, 'anon does not see notes of withdrawn entities');
select is((select count(*) from public.character_locations), 1::bigint, 'anon does not see relations with withdrawn endpoints');
select is((select count(*) from public.geographic_names), 2::bigint, 'anon sees only valid published geographic names');

select ok(pg_temp.statement_fails('select * from public.public_requests'), 'anon cannot enumerate requests');
select ok(pg_temp.statement_fails('select * from private.admin_users'), 'anon cannot read the administrative allowlist');

select ok(
  pg_temp.statement_fails(
    $$insert into public.categories (id, slug, name) values ('category-anon', 'anon', 'Anon')$$
  ),
  'anon cannot insert content'
);

select ok(
  pg_temp.statement_fails(
    $$insert into public.public_requests (
      sender_name,
      proposed_name,
      entity_type,
      x,
      y,
      description,
      reason
    ) values (
      'Direct',
      'Direct request',
      'location',
      1,
      1,
      'Direct insert',
      'Must fail'
    )$$
  ),
  'anon cannot insert requests directly'
);

select ok(
  public.submit_public_request(
    'RPC Visitor',
    'RPC Beacon',
    'location',
    2100,
    1350,
    'A valid request submitted through the closed operation.',
    'Exercises the approved public path.'
  ),
  'anon can submit a valid request through the RPC'
);

select ok(
  pg_temp.statement_fails(
    $$select public.submit_public_request(
      'Invalid',
      'Out of bounds',
      'location',
      -1,
      100,
      'Invalid coordinates.',
      'Must fail.'
    )$$
  ),
  'the RPC rejects invalid coordinates'
);

select ok(
  public.submit_public_request(
    'Bot',
    'Honeypot',
    'location',
    1,
    1,
    'This must not be stored.',
    'Honeypot test.',
    'filled-by-bot'
  ),
  'the honeypot returns a minimal success result'
);

reset role;

select is(
  (select count(*) from public.public_requests),
  2::bigint,
  'only the valid RPC request was stored'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select is((select private.is_admin()), false, 'editable user metadata does not grant administration');
select is((select count(*) from public.map_entities), 2::bigint, 'authenticated non-admin keeps public reads');

select ok(
  pg_temp.statement_fails(
    $$insert into public.categories (id, slug, name) values (
      'category-non-admin',
      'non-admin',
      'Non admin'
    )$$
  ),
  'authenticated non-admin cannot insert content'
);

select is(
  (
    with changed as (
      update public.map_entities
      set summary = 'Unauthorized change'
      where id = 'entity-aster-guide'
      returning 1
    )
    select count(*) from changed
  ),
  0::bigint,
  'authenticated non-admin cannot update visible content'
);

select ok(
  pg_temp.statement_fails('select * from public.public_requests'),
  'authenticated non-admin cannot enumerate requests'
);

reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select is((select private.is_admin()), true, 'allowlisted user is an administrator');
select is((select count(*) from public.map_entities), 5::bigint, 'administrator sees every entity state');
select is((select count(*) from public.public_requests), 2::bigint, 'administrator can enumerate requests');

select ok(
  pg_temp.statement_succeeds(
    $$insert into public.categories (id, slug, name) values (
      'category-admin-temporary',
      'admin-temporary',
      'Admin temporary'
    )$$
  ),
  'administrator can create draft content'
);

select ok(
  pg_temp.statement_fails(
    $$update public.map_entities
      set publication_status = 'published'
      where id = 'entity-dawn-envoy'$$
  ),
  'archived content cannot transition directly to published'
);

select ok(
  pg_temp.statement_succeeds(
    $$update public.map_entities
      set publication_status = 'draft'
      where id = 'entity-dawn-envoy'$$
  ),
  'administrator can restore archived content to draft'
);

select ok(
  pg_temp.statement_succeeds(
    $$update public.map_entities
      set publication_status = 'published'
      where id = 'entity-dawn-envoy'$$
  ),
  'restored draft content can be published after review'
);

select ok(
  pg_temp.statement_fails(
    $$delete from public.map_entities where id = 'entity-aster-guide'$$
  ),
  'administrator cannot physically delete currently published content'
);

select ok(
  pg_temp.statement_fails(
    $$delete from public.map_entities where id = 'entity-cinder-rival'$$
  ),
  'administrator cannot physically delete formerly published content'
);

select ok(
  pg_temp.statement_succeeds(
    $$delete from public.categories where id = 'category-admin-temporary'$$
  ),
  'administrator can exceptionally delete an unpublished unreferenced draft'
);

select ok(
  pg_temp.statement_succeeds(
    $$update public.public_requests
      set request_status = 'accepted'
      where id = '10000000-0000-4000-8000-000000000001'$$
  ),
  'administrator can perform a valid request transition'
);

select ok(
  pg_temp.statement_fails(
    $$update public.public_requests
      set request_status = 'pending'
      where id = '10000000-0000-4000-8000-000000000001'$$
  ),
  'closed request transitions cannot return to pending'
);

select * from finish();
rollback;
