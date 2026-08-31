begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create function pg_temp.statement_fails_with_sqlstate(statement text, expected_state text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return false;
exception
  when others then
    return sqlstate = expected_state;
end;
$$;

select plan(3);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select ok(
  pg_temp.statement_fails_with_sqlstate($sql$
    select public.admin_get_map_entity_editor_v6(
      '00000000-0000-4000-8000-000000000053'::uuid,
      'entity-aster-guide'
    )
  $sql$, '42501'),
  'authenticated non-admin cannot read geometry through the v6 entity editor RPC'
);

select ok(
  pg_temp.statement_fails_with_sqlstate($sql$
    select public.admin_save_map_entity_v6(
      '00000000-0000-4000-8000-000000000053'::uuid,
      'entity-map060-nonadmin-probe',
      null::timestamptz,
      null::text,
      'map060-nonadmin-probe',
      'location'::public.entity_type,
      'pin'::public.map_visibility,
      'public'::public.entity_audience,
      null::text,
      'MAP060 non-admin probe',
      '',
      '',
      '{"kind":"point","coordinates":{"x":100,"y":100}}'::jsonb,
      'category-places',
      'draft'::public.publication_status,
      '{}'::text[],
      '[]'::jsonb,
      '{}'::text[]
    )
  $sql$, '42501'),
  'authenticated non-admin cannot write geometry through the v6 entity save RPC'
);

select ok(
  pg_temp.statement_fails_with_sqlstate($sql$
    select public.admin_get_master_catalog_v5(
      '00000000-0000-4000-8000-000000000053'::uuid
    )
  $sql$, '42501'),
  'authenticated non-admin cannot read Master geometry through the v5 catalog RPC'
);

reset role;
select * from finish();
rollback;
