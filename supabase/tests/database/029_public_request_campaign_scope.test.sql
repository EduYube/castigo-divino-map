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

select plan(28);

-- Synthetic A/B canaries are deliberately distinct. Campaign A is the seeded
-- initial campaign; B and archived C exist only inside this rolled-back test.
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

insert into public.campaigns (id, slug, name, status, display_order)
values
  ('00000000-0000-4000-8000-000000000056', 'map056-campaign-b', 'MAP056 Campaign B', 'active', 56),
  ('00000000-0000-4000-8000-000000000057', 'map056-archived', 'MAP056 Archived', 'archived', 57);

insert into public.categories (campaign_id, id, slug, name, description, publication_status)
values (
  '00000000-0000-4000-8000-000000000056',
  'category-map056-b', 'map056-b', 'MAP056 B category', 'B only', 'published'
);

insert into public.players (campaign_id, id, slug, display_name, publication_status)
values (
  '00000000-0000-4000-8000-000000000056',
  'player-map056-b', 'player-map056-b', 'MAP056 B player', 'published'
);

reset role;
set local role anon;

select ok(
  public.submit_public_request_v2(
    '00000000-0000-4000-8000-000000000053',
    'MAP056 A sender', 'MAP056 A REQUEST CANARY', 'location', 1560, 560,
    'MAP056 A description', 'MAP056 A reason', ''
  ),
  'anon can create request A in active campaign A'
);
select ok(
  public.submit_public_request_v2(
    '00000000-0000-4000-8000-000000000056',
    'MAP056 B sender', 'MAP056 B REQUEST CANARY', 'character', 2560, 660,
    'MAP056 B description', 'MAP056 B reason', ''
  ),
  'anon can create request B in active campaign B'
);
select ok(
  pg_temp.statement_fails($sql$
    select public.submit_public_request_v2(
      '00000000-0000-4000-8000-000000000999',
      'Invalid', 'MAP056 INVALID CANARY', 'location', 100, 100,
      'Invalid campaign', 'Must reject', ''
    )
  $sql$),
  'public ingress rejects an unknown campaign UUID'
);
select ok(
  pg_temp.statement_fails($sql$
    select public.submit_public_request_v2(
      '00000000-0000-4000-8000-000000000057',
      'Archived', 'MAP056 ARCHIVED CANARY', 'location', 100, 100,
      'Archived campaign', 'Must reject', ''
    )
  $sql$),
  'public ingress rejects an archived campaign'
);

reset role;

select is(
  (select campaign_id from public.public_requests where proposed_name = 'MAP056 A REQUEST CANARY'),
  '00000000-0000-4000-8000-000000000053'::uuid,
  'request A persists campaign A'
);
select is(
  (select campaign_id from public.public_requests where proposed_name = 'MAP056 B REQUEST CANARY'),
  '00000000-0000-4000-8000-000000000056'::uuid,
  'request B persists campaign B'
);
select is(
  (select count(*) from public.public_requests where campaign_id = '00000000-0000-4000-8000-000000000053' and proposed_name = 'MAP056 B REQUEST CANARY'),
  0::bigint,
  'request B never appears in campaign A scope'
);
select is(
  (select count(*) from public.public_requests where campaign_id = '00000000-0000-4000-8000-000000000056' and proposed_name = 'MAP056 A REQUEST CANARY'),
  0::bigint,
  'request A never appears in campaign B scope'
);
select is(
  (select count(*) from public.public_requests where proposed_name in ('MAP056 INVALID CANARY', 'MAP056 ARCHIVED CANARY')),
  0::bigint,
  'rejected ingress attempts leave no request rows'
);

select ok(
  to_regprocedure('public.admin_moderate_public_request(uuid,timestamp with time zone,text,text)') is null,
  'the legacy unscoped moderation RPC no longer exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.admin_moderate_public_request_v2(uuid,uuid,timestamp with time zone,text,text)',
    'execute'
  ),
  'anon cannot execute administrative moderation'
);
select ok(
  (
    select p.prosecdef
       and p.proowner::regrole::text = 'atlas_public_request_moderator'
       and p.proconfig @> array['search_path=""']::text[]
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_moderate_public_request_v2'
  ),
  'v2 uses the hardened dedicated SECURITY DEFINER owner and empty search_path'
);
select ok(
  (
    select pg_catalog.pg_get_function_arguments(p.oid) not ilike '%audience%'
       and pg_catalog.pg_get_function_arguments(p.oid) not ilike '%category%'
       and pg_catalog.pg_get_function_arguments(p.oid) not ilike '%player%'
       and pg_catalog.pg_get_function_arguments(p.oid) not ilike '%converted%'
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_moderate_public_request_v2'
  ),
  'moderation accepts no audience, category, player or converted-entity input'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $sql$
    select public.admin_moderate_public_request_v2(
      '00000000-0000-4000-8000-000000000053', request.id, request.updated_at, 'reject', null
    )
    from public.public_requests request
    where request.proposed_name = 'MAP056 A REQUEST CANARY'
  $sql$,
  '42501',
  'administrative authorization required',
  'authenticated non-admin cannot moderate campaign A'
);

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $sql$
    select public.admin_moderate_public_request_v2(
      '00000000-0000-4000-8000-000000000056', request.id, request.updated_at, 'convert', 'wrong context'
    )
    from public.public_requests request
    where request.proposed_name = 'MAP056 A REQUEST CANARY'
  $sql$,
  '42501',
  'request does not belong to selected campaign',
  'request A cannot be moderated from campaign B context'
);

select lives_ok(
  $sql$
    select public.admin_moderate_public_request_v2(
      request.campaign_id, request.id, request.updated_at, 'convert', 'MAP056 A conversion'
    )
    from public.public_requests request
    where request.proposed_name = 'MAP056 A REQUEST CANARY'
  $sql$,
  'authorized admin converts request A in campaign A'
);
select lives_ok(
  $sql$
    select public.admin_moderate_public_request_v2(
      request.campaign_id, request.id, request.updated_at, 'convert', 'MAP056 B conversion'
    )
    from public.public_requests request
    where request.proposed_name = 'MAP056 B REQUEST CANARY'
  $sql$,
  'authorized admin converts request B in campaign B'
);

select is(
  (
    select entity.campaign_id
    from public.public_requests request
    join public.map_entities entity
      on entity.id = request.converted_entity_id
     and entity.campaign_id = request.campaign_id
    where request.proposed_name = 'MAP056 A REQUEST CANARY'
  ),
  '00000000-0000-4000-8000-000000000053'::uuid,
  'converted A entity is in campaign A'
);
select is(
  (
    select entity.campaign_id
    from public.public_requests request
    join public.map_entities entity
      on entity.id = request.converted_entity_id
     and entity.campaign_id = request.campaign_id
    where request.proposed_name = 'MAP056 B REQUEST CANARY'
  ),
  '00000000-0000-4000-8000-000000000056'::uuid,
  'converted B entity is in campaign B'
);
select is(
  (
    select entity.audience
    from public.public_requests request
    join public.map_entities entity on entity.id = request.converted_entity_id
    where request.proposed_name = 'MAP056 B REQUEST CANARY'
  ),
  'public'::public.entity_audience,
  'anonymous proposal conversion can only create public-audience content'
);
select is(
  (
    select count(*)
    from public.map_entities entity
    where entity.campaign_id = '00000000-0000-4000-8000-000000000053'
      and entity.name = 'MAP056 B REQUEST CANARY'
  ),
  0::bigint,
  'converted B entity never appears in campaign A'
);
select ok(
  (
    select request.converted_entity_id = entity.id
       and request.campaign_id = entity.campaign_id
    from public.public_requests request
    join public.map_entities entity on entity.id = request.converted_entity_id
    where request.proposed_name = 'MAP056 B REQUEST CANARY'
  ),
  'converted_entity_id preserves same-campaign traceability'
);

-- Double moderation/replay uses the optimistic revision and terminal state.
select throws_ok(
  $sql$
    select public.admin_moderate_public_request_v2(
      request.campaign_id,
      request.id,
      '2000-01-01T00:00:00Z'::timestamptz,
      'reject',
      'replay'
    )
    from public.public_requests request
    where request.proposed_name = 'MAP056 B REQUEST CANARY'
  $sql$,
  '40001',
  'public request changed or was already processed',
  'a processed request cannot be moderated again with an out-of-order revision'
);

reset role;

-- Structural canaries run as database owner so failures cannot be attributed to RLS.
select ok(
  pg_temp.statement_fails($sql$
    insert into public.map_entities (
      campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
      x, y, category_id, publication_status
    ) values (
      '00000000-0000-4000-8000-000000000053',
      'entity-map056-bad-category', 'map056-bad-category', 'location', 'pin', 'public',
      'MAP056 bad category', '', '', 1, 1, 'category-map056-b', 'draft'
    )
  $sql$),
  'cross-campaign category references are rejected structurally'
);
select ok(
  pg_temp.statement_fails($sql$
    insert into public.entity_player_dispositions (campaign_id, entity_id, player_id, disposition)
    select
      '00000000-0000-4000-8000-000000000053',
      request.converted_entity_id,
      'player-map056-b',
      'neutral'
    from public.public_requests request
    where request.proposed_name = 'MAP056 A REQUEST CANARY'
  $sql$),
  'cross-campaign player references are rejected structurally'
);
select ok(
  pg_temp.statement_fails($sql$
    update public.public_requests target
    set converted_entity_id = source.converted_entity_id
    from public.public_requests source
    where target.proposed_name = 'MAP056 A REQUEST CANARY'
      and source.proposed_name = 'MAP056 B REQUEST CANARY'
  $sql$),
  'converted_entity_id cannot be manipulated to an entity from another campaign'
);

select is(
  (select count(*) from public.public_requests where proposed_name = 'MAP056 A REQUEST CANARY' and request_status = 'converted'),
  1::bigint,
  'request A remains converted exactly once'
);
select is(
  (select count(*) from public.public_requests where proposed_name = 'MAP056 B REQUEST CANARY' and request_status = 'converted'),
  1::bigint,
  'request B remains converted exactly once'
);

select * from finish();
rollback;
