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

select plan(1);

update public.map_entities
set portrait_path = 'portraits/77777777-7777-4777-8777-777777777777.webp'
where id = 'entity-aster-guide';

select ok(
  pg_temp.statement_fails($sql$
    update public.map_entities
    set portrait_path = 'portraits/77777777-7777-4777-8777-777777777777.webp'
    where id = 'entity-cinder-rival'
  $sql$),
  'a portrait object path cannot be owned by two entities at the same time'
);

select * from finish();
rollback;
