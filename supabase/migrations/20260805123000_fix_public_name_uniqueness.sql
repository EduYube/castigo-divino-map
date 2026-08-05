-- MAP-014: disambiguate the trigger-local normalized name from table columns.

create or replace function private.enforce_public_name_uniqueness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_normalized_value text;
begin
  if new.publication_status <> 'published' then
    return new;
  end if;

  if tg_table_name = 'map_entities' then
    candidate_normalized_value := new.normalized_name;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(candidate_normalized_value, 0)
    );

    if exists (
      select 1
      from public.entity_aliases as alias
      where alias.publication_status = 'published'
        and alias.normalized_value = candidate_normalized_value
    ) then
      raise exception using
        errcode = '23505',
        message = 'published names and aliases must be unambiguous';
    end if;
  else
    candidate_normalized_value := new.normalized_value;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(candidate_normalized_value, 0)
    );

    if exists (
      select 1
      from public.map_entities as entity
      where entity.publication_status = 'published'
        and entity.normalized_name = candidate_normalized_value
    ) then
      raise exception using
        errcode = '23505',
        message = 'published names and aliases must be unambiguous';
    end if;
  end if;

  return new;
end;
$$;
