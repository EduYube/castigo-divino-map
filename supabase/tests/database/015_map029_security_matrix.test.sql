begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

select is(
  (
    select count(*)
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and relation.relrowsecurity
  ),
  (
    select count(*)
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
  ),
  'every exposed public table has RLS enabled'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and 'anon' = any(roles)
  ),
  0::bigint,
  'anon has no direct write policy on exposed tables'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and 'authenticated' = any(roles)
      and coalesce(qual, '') !~ 'private[.]is_admin'
      and coalesce(with_check, '') !~ 'private[.]is_admin'
  ),
  0::bigint,
  'every authenticated write policy is gated by the administrative allowlist'
);

select ok(
  not pg_catalog.has_table_privilege('anon', 'public.public_requests', 'SELECT'),
  'anon has no table-level SELECT grant on public requests'
);
select ok(
  not pg_catalog.has_table_privilege('anon', 'public.public_requests', 'INSERT'),
  'anon has no table-level INSERT grant on public requests'
);
select ok(
  not pg_catalog.has_table_privilege('anon', 'public.public_requests', 'UPDATE'),
  'anon has no table-level UPDATE grant on public requests'
);
select ok(
  not pg_catalog.has_table_privilege('anon', 'public.public_requests', 'DELETE'),
  'anon has no table-level DELETE grant on public requests'
);

select ok(
  not pg_catalog.has_table_privilege('anon', 'private.admin_users', 'SELECT'),
  'anon cannot read the administrative allowlist'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'private.admin_users', 'SELECT'),
  'authenticated users cannot read the administrative allowlist directly'
);
select ok(
  not pg_catalog.has_table_privilege('anon', 'private.reserved_public_identifiers', 'SELECT'),
  'anon cannot enumerate reserved public identifiers'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'private.reserved_public_identifiers', 'SELECT'),
  'authenticated users cannot enumerate reserved public identifiers directly'
);

select ok(
  pg_catalog.has_function_privilege(
    'anon',
    'public.submit_public_request(text,text,public.entity_type,double precision,double precision,text,text,text)',
    'EXECUTE'
  ),
  'anon may execute only the closed public request RPC'
);
select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.submit_public_request(text,text,public.entity_type,double precision,double precision,text,text,text)',
    'EXECUTE'
  ),
  'authenticated users may use the same public request RPC'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.current_user_is_admin()',
    'EXECUTE'
  ),
  'anon cannot call the administrative authorization probe'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.admin_get_map_entity_editor(text)',
    'EXECUTE'
  ),
  'anon cannot call the administrative entity reader'
);
select ok(
  to_regprocedure(
    'public.admin_moderate_public_request(uuid,timestamp with time zone,text,text)'
  ) is null
  and not pg_catalog.has_function_privilege(
    'anon',
    'public.admin_moderate_public_request_v2(uuid,uuid,timestamp with time zone,text,text)',
    'EXECUTE'
  ),
  'the legacy unscoped moderation RPC is absent and anon cannot call scoped moderation'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_proc as function
    join pg_catalog.pg_namespace as namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.prosecdef
      and not ('search_path=""' = any(coalesce(function.proconfig, '{}'::text[])))
  ),
  0::bigint,
  'every exposed SECURITY DEFINER function fixes an empty search_path'
);

select is(
  (
    select pg_catalog.pg_get_userbyid(function.proowner)
    from pg_catalog.pg_proc as function
    join pg_catalog.pg_namespace as namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname = 'admin_moderate_public_request_v2'
  ),
  'atlas_public_request_moderator',
  'moderation SECURITY DEFINER keeps its dedicated NOLOGIN owner'
);
select ok(
  not (
    select role.rolsuper or role.rolbypassrls or role.rolcanlogin
    from pg_catalog.pg_roles as role
    where role.rolname = 'atlas_public_request_moderator'
  ),
  'the moderation owner is NOLOGIN, non-superuser and cannot bypass RLS'
);

select ok(
  not pg_catalog.has_column_privilege(
    'authenticated',
    'public.public_requests',
    'request_status',
    'UPDATE'
  ),
  'authenticated browsers cannot update request status directly'
);
select ok(
  not pg_catalog.has_column_privilege(
    'authenticated',
    'public.public_requests',
    'moderation_note',
    'UPDATE'
  ),
  'authenticated browsers cannot update moderation notes directly'
);
select ok(
  not pg_catalog.has_column_privilege(
    'authenticated',
    'public.public_requests',
    'converted_entity_id',
    'UPDATE'
  ),
  'authenticated browsers cannot link converted entities directly'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'public_requests'
      and 'anon' = any(roles)
  ),
  0::bigint,
  'public requests have no anon RLS policy in any direction'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and cmd = 'SELECT'
      and 'anon' = any(roles)
      and tablename <> 'public_requests'
      and coalesce(qual, '') = 'true'
  ),
  0::bigint,
  'no anonymous SELECT policy is an unconditional allow-all'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select is((select public.current_user_is_admin()), false, 'non-allowlisted authenticated user is not an administrator');
select is((select count(*) from public.public_requests), 0::bigint, 'non-admin cannot enumerate public requests through RLS');

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select is((select public.current_user_is_admin()), true, 'allowlisted authenticated user passes the administrative probe');

select * from finish();
rollback;
