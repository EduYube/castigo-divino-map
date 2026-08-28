begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temporary table _map_015_rls_helpers (id integer);

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

select plan(44);

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
  'editable user metadata does not define the allowlist'
);

select is(
  (select count(*) from public.public_requests),
  1::bigint,
  'one deterministic pending request is seeded'
);

set local role anon;

select is((select count(*) from public.map_entities), 4::bigint, 'anon sees only published entities');
select is((select count(*) from public.categories), 4::bigint, 'anon sees only published categories');
select is((select count(*) from public.tags), 5::bigint, 'anon sees only published tags');
select is((select count(*) from public.players), 2::bigint, 'anon sees the two published player perspectives');
select is(
  (select count(*) from public.entity_player_dispositions),
  8::bigint,
  'anon sees one disposition for every public entity and public player'
);
select is((select count(*) from public.entity_aliases), 3::bigint, 'anon does not see aliases of withdrawn entities');
select is((select count(*) from public.entity_tags), 7::bigint, 'anon does not see tag relations of withdrawn entities');
select is((select count(*) from public.public_notes), 3::bigint, 'anon does not see notes of withdrawn entities');
select is((select count(*) from public.public_note_tags), 6::bigint, 'anon sees note tags only through public endpoints');
select is(
  (select count(*) from public.character_location_events),
  2::bigint,
  'anon sees the public sighting and departure for a public character'
);
select is(
  (select count(*) from public.geographic_names),
  215::bigint,
  'anon sees the MAP-039 raster inventory plus the two published local geographic fixtures'
);
select is(
  (select count(*) from public.geographic_name_aliases),
  15::bigint,
  'anon sees MAP-039 aliases, MAP-040 Spanish aliases and the published local geographic alias'
);

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
  public.submit_public_request_v3(
    public.begin_public_request_submission('00000000-0000-4000-8000-000000000053'::uuid) ->> 'submission_token',
    'RPC Visitor',
    'RPC Beacon',
    'location',
    2100,
    1350,
    'A valid request submitted through the closed operation.',
    'Exercises the approved public path.'
  ),
  'anon can submit a valid request through the bound RPC'
);

select ok(
  pg_temp.statement_fails(
    $$select public.submit_public_request_v3(
      public.begin_public_request_submission('00000000-0000-4000-8000-000000000053'::uuid) ->> 'submission_token',
      'Invalid',
      'Out of bounds',
      'location',
      -1,
      100,
      'Invalid coordinates.',
      'Must fail.'
    )$$
  ),
  'the bound RPC rejects invalid coordinates'
);

select ok(
  public.submit_public_request_v3(
    public.begin_public_request_submission('00000000-0000-4000-8000-000000000053'::uuid) ->> 'submission_token',
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
select is((select count(*) from public.map_entities), 4::bigint, 'authenticated non-admin keeps public reads');
select is(
  (select count(*) from public.entity_player_dispositions),
  8::bigint,
  'authenticated non-admin keeps only public disposition reads'
);

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
  pg_temp.statement_affected_rows(
    $$update public.map_entities
      set summary = 'Unauthorized change'
      where id = 'entity-aster-guide'$$
  ),
  0::bigint,
  'authenticated non-admin cannot update visible content'
);

select is(
  (select count(*) from public.public_requests),
  0::bigint,
  'authenticated non-admin cannot enumerate requests'
);

reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select is((select private.is_admin()), true, 'allowlisted user is an administrator');
select is((select count(*) from public.map_entities), 7::bigint, 'administrator sees every entity state');
select is((select count(*) from public.players), 2::bigint, 'administrator sees every player state');
select is(
  (select count(*) from public.entity_player_dispositions),
  14::bigint,
  'administrator sees the complete entity-player matrix'
);
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
  pg_temp.statement_fails(
    $$update public.public_requests
      set request_status = 'accepted'
      where id = '10000000-0000-4000-8000-000000000001'$$
  ),
  'administrator browser cannot bypass the moderation RPC with a direct request transition'
);

select ok(
  pg_temp.statement_succeeds(
    $$select public.admin_moderate_public_request_v2(
      '00000000-0000-4000-8000-000000000053',
      '10000000-0000-4000-8000-000000000001',
      (select updated_at from public.public_requests where id = '10000000-0000-4000-8000-000000000001'),
      'reject',
      null
    )$$
  ),
  'administrator can moderate a request through the authoritative scoped RPC'
);

select * from finish();
rollback;
