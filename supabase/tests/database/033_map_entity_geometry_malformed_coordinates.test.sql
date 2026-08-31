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

select plan(2);

select ok(
  pg_temp.statement_fails_with_sqlstate($sql$
    select private.normalize_map_entity_geometry(
      'character'::public.entity_type,
      '{"kind":"point","coordinates":{"x":10}}'::jsonb
    )
  $sql$, '23514'),
  'point geometry with a missing coordinate is rejected explicitly as malformed'
);

select ok(
  pg_temp.statement_fails_with_sqlstate($sql$
    select private.normalize_map_entity_geometry(
      'location'::public.entity_type,
      '{"kind":"polygon","vertices":[{"x":10,"y":10},{"x":20},{"x":20,"y":20}]}'::jsonb
    )
  $sql$, '23514'),
  'polygon geometry with a missing vertex coordinate is rejected explicitly as malformed'
);

select * from finish();
rollback;