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

select plan(4);

select ok(
  has_function_privilege('authenticated', 'public.admin_get_master_catalog()', 'execute'),
  'authenticated role may invoke the RLS-protected master catalog RPC'
);

select ok(
  not has_function_privilege('anon', 'public.admin_get_master_catalog()', 'execute'),
  'anon cannot execute the master catalog RPC'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select ok(
  pg_temp.statement_fails($$select public.admin_get_master_catalog()$$),
  'authenticated non-admin is rejected by the master catalog authorization check'
);

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select is(
  pg_catalog.jsonb_typeof(public.admin_get_master_catalog()),
  'object',
  'authorized admin receives the ephemeral master catalog document'
);

select * from finish();
rollback;