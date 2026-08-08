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
values
  (
    '10000000-0000-4000-8000-000000000271',
    'Conversion Visitor',
    'Requested Lantern',
    'location',
    2111,
    1444,
    'A requested location description.',
    'This reason must remain moderation-only.'
  ),
  (
    '10000000-0000-4000-8000-000000000272',
    'Rejected Visitor',
    'Rejected Lantern',
    'character',
    500,
    700,
    'A request that will be rejected.',
    'Exercises rejection audit history.'
  ),
  (
    '10000000-0000-4000-8000-000000000273',
    'Unauthorized Visitor',
    'Unauthorized Lantern',
    'location',
    600,
    800,
    'A request used for non-admin authorization.',
    'Must stay pending.'
  );

select plan(24);

select ok(
  to_regprocedure(
    'public.admin_moderate_public_request(uuid,timestamp with time zone,text,text)'
  ) is not null,
  'MAP-027 exposes the administrative moderation RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.admin_moderate_public_request(uuid,timestamp with time zone,text,text)',
    'EXECUTE'
  ),
  'anon cannot execute the moderation RPC'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_moderate_public_request(uuid,timestamp with time zone,text,text)',
    'EXECUTE'
  ),
  'authenticated may reach the RPC so RLS and the admin allowlist can authorize it'
);

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'map_entities'
      and column_name = 'category_id'
  ),
  'YES',
  'an incomplete draft may remain uncategorized until editorial review'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$select public.admin_moderate_public_request(
      '10000000-0000-4000-8000-000000000273',
      timezone('utc', now()),
      'reject',
      null
    )$$,
  '42501',
  'administrative authorization required',
  'an authenticated non-admin cannot moderate a request'
);

reset role;

select is(
  (
    select request_status
    from public.public_requests
    where id = '10000000-0000-4000-8000-000000000273'
  ),
  'pending'::public.request_status,
  'a rejected non-admin attempt leaves the request pending'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$select public.admin_moderate_public_request(
      '10000000-0000-4000-8000-000000000272',
      (select updated_at from public.public_requests where id = '10000000-0000-4000-8000-000000000272'),
      'reject',
      '  Not enough evidence.  '
    )$$,
  'an administrator can reject a pending request'
);

select is(
  (
    select request_status
    from public.public_requests
    where id = '10000000-0000-4000-8000-000000000272'
  ),
  'rejected'::public.request_status,
  'rejection records the terminal moderation state'
);

select is(
  (
    select moderation_note
    from public.public_requests
    where id = '10000000-0000-4000-8000-000000000272'
  ),
  'Not enough evidence.',
  'rejection stores the optional administrative note after normalization'
);

select is(
  (
    select moderator_user_id
    from public.public_requests
    where id = '10000000-0000-4000-8000-000000000272'
  ),
  '00000000-0000-4000-8000-000000000001'::uuid,
  'rejection records the authenticated administrator in PostgreSQL'
);

select ok(
  (
    select moderated_at is not null
    from public.public_requests
    where id = '10000000-0000-4000-8000-000000000272'
  ),
  'rejection records its database-owned moderation timestamp'
);

select throws_ok(
  $$delete from public.public_requests
    where id = '10000000-0000-4000-8000-000000000272'$$,
  '23514',
  'moderated public requests cannot be physically deleted',
  'rejected requests preserve their audit history'
);

select lives_ok(
  $$select public.admin_moderate_public_request(
      '10000000-0000-4000-8000-000000000271',
      (select updated_at from public.public_requests where id = '10000000-0000-4000-8000-000000000271'),
      'convert',
      null
    )$$,
  'an administrator can atomically convert a pending request into a draft'
);

select is(
  (
    select request_status
    from public.public_requests
    where id = '10000000-0000-4000-8000-000000000271'
  ),
  'converted'::public.request_status,
  'conversion closes the request as converted'
);

select is(
  (
    select converted_entity_id
    from public.public_requests
    where id = '10000000-0000-4000-8000-000000000271'
  ),
  'entity-request-10000000000040008000000000000271',
  'conversion stores a deterministic reference to the created draft'
);

select is(
  (
    select publication_status
    from public.map_entities
    where id = 'entity-request-10000000000040008000000000000271'
  ),
  'draft'::public.publication_status,
  'conversion creates only a draft entity'
);

select ok(
  (
    select category_id is null
    from public.map_entities
    where id = 'entity-request-10000000000040008000000000000271'
  ),
  'conversion does not assign a category automatically'
);

select is(
  (
    select count(*)
    from public.entity_tags
    where entity_id = 'entity-request-10000000000040008000000000000271'
  ),
  0::bigint,
  'conversion does not copy or invent tags'
);

select ok(
  (
    select entity_type = 'location'::public.entity_type
      and visibility = 'pin'::public.map_visibility
      and name = 'Requested Lantern'
      and summary = ''
      and description = 'A requested location description.'
      and x = 2111
      and y = 1444
    from public.map_entities
    where id = 'entity-request-10000000000040008000000000000271'
  ),
  'conversion copies only the unambiguous editable pin fields'
);

select ok(
  (
    select published_at is null
    from public.map_entities
    where id = 'entity-request-10000000000040008000000000000271'
  ),
  'a converted draft has never been published'
);

select throws_ok(
  $$select public.admin_moderate_public_request(
      '10000000-0000-4000-8000-000000000271',
      '2000-01-01T00:00:00Z'::timestamptz,
      'convert',
      null
    )$$,
  '40001',
  'public request changed or was already processed',
  'the same request cannot be processed twice with a stale revision'
);

select throws_ok(
  $$update public.map_entities
    set publication_status = 'published'
    where id = 'entity-request-10000000000040008000000000000271'$$,
  '23514',
  'a published entity requires a published category',
  'an uncategorized converted draft cannot be published'
);

set local role anon;

select is(
  (
    select count(*)
    from public.map_entities
    where id = 'entity-request-10000000000040008000000000000271'
  ),
  0::bigint,
  'anon cannot see the converted draft'
);

select ok(
  pg_temp.statement_fails('select * from public.public_requests'),
  'anon still cannot enumerate public requests after MAP-027'
);

select * from finish();
rollback;
