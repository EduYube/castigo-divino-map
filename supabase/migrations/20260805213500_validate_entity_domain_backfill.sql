-- MAP-015: validate expanded legacy data before removing provisional columns.

DO $$
begin
  if exists (
    select 1
    from public.map_entities as entity
    where entity.disposition = 'unknown'
  ) then
    raise exception using
      errcode = '23514',
      message = 'legacy unknown dispositions must be normalized before contraction';
  end if;

  if exists (
    select 1
    from public.geographic_names as geographic_name
    join public.map_entities as entity
      on entity.id = geographic_name.entity_id
    where entity.entity_type <> 'location'
  ) then
    raise exception using
      errcode = '23514',
      message = 'legacy geographic names may only link to location entities';
  end if;

  if exists (
    select 1
    from public.geographic_names as geographic_name
    cross join lateral unnest(geographic_name.aliases) as alias_value
    where btrim(alias_value) <> ''
      and private.normalize_search_text(alias_value) = ''
  ) then
    raise exception using
      errcode = '23514',
      message = 'legacy geographic aliases must contain searchable characters';
  end if;

  if exists (
    select 1
    from public.geographic_name_aliases as alias
    join public.geographic_names as geographic_name
      on geographic_name.normalized_name = alias.normalized_value
    where alias.publication_status = 'published'
      and geographic_name.publication_status = 'published'
  ) then
    raise exception using
      errcode = '23505',
      message = 'published geographic names and aliases must be unambiguous';
  end if;

  if exists (
    select 1
    from public.map_entities as entity
    cross join public.players as player
    left join public.entity_player_dispositions as relation
      on relation.entity_id = entity.id
      and relation.player_id = player.id
    where relation.entity_id is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'the entity-player disposition matrix must be complete';
  end if;
end;
$$;
