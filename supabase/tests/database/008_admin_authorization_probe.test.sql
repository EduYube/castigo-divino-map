begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

select isnt(
  to_regprocedure('public.current_user_is_admin()'),
  null,
  'administrative authorization probe exists in the exposed public schema'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = to_regprocedure('public.current_user_is_admin()')
  ),
  true,
  'administrative authorization probe is SECURITY DEFINER'
);

select ok(
  (
    select coalesce(array_to_string(proconfig, ','), '') like '%search_path=%'
    from pg_proc
    where oid = to_regprocedure('public.current_user_is_admin()')
  ),
  'administrative authorization probe pins its search_path'
);

select ok(
  has_function_privilege('anon', 'public.current_user_is_admin()', 'execute'),
  'anon may invoke the minimal probe without gaining private schema access'
);

set local role anon;
select is(public.current_user_is_admin(), false, 'anonymous callers are not administrators');
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select is(
  public.current_user_is_admin(),
  false,
  'authenticated users outside the allowlist are not administrators'
);
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select is(
  public.current_user_is_admin(),
  true,
  'the allowlisted authenticated user is an administrator'
);
reset role;

select * from finish();
rollback;
