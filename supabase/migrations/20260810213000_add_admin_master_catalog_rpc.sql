-- MAP-044: admin-only, ephemeral read model for Modo Máster.
--
-- PublicCatalogSnapshotV2 remains player-safe. This SECURITY INVOKER function is
-- deliberately separate and can only be executed by authenticated identities that
-- pass the existing administrative allowlist check. The browser keeps the result in
-- memory and purges it when Modo Máster is disabled or authorization is lost.

create function public.admin_get_master_catalog()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception using
      errcode = '42501',
      message = 'administrative authorization required';
  end if;

  select pg_catalog.jsonb_build_object(
    'entities', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', entity.id,
          'slug', entity.slug,
          'entity_type', entity.entity_type,
          'visibility', entity.visibility,
          'audience', entity.audience,
          'name', entity.name,
          'summary', entity.summary,
          'description', entity.description,
          'x', entity.x,
          'y', entity.y,
          'category_id', entity.category_id,
          'updated_at', entity.updated_at
        ) order by entity.id
      )
      from public.map_entities as entity
      where entity.audience = 'master'
        and entity.publication_status = 'published'
    ), '[]'::jsonb),
    'categories', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id', category.id, 'name', category.name)
        order by category.id
      )
      from public.categories as category
      where exists (
        select 1
        from public.map_entities as entity
        where entity.audience = 'master'
          and entity.publication_status = 'published'
          and entity.category_id = category.id
      )
    ), '[]'::jsonb),
    'aliases', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', alias.id,
          'entity_id', alias.entity_id,
          'value', alias.value
        ) order by alias.id
      )
      from public.entity_aliases as alias
      join public.map_entities as entity on entity.id = alias.entity_id
      where entity.audience = 'master'
        and entity.publication_status = 'published'
        and alias.publication_status = 'published'
    ), '[]'::jsonb),
    'tags', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id', tag.id, 'name', tag.name)
        order by tag.id
      )
      from public.tags as tag
      where exists (
        select 1
        from public.entity_tags as link
        join public.map_entities as entity on entity.id = link.entity_id
        where entity.audience = 'master'
          and entity.publication_status = 'published'
          and link.publication_status = 'published'
          and link.tag_id = tag.id
      )
    ), '[]'::jsonb),
    'entity_tags', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('entity_id', link.entity_id, 'tag_id', link.tag_id)
        order by link.entity_id, link.tag_id
      )
      from public.entity_tags as link
      join public.map_entities as entity on entity.id = link.entity_id
      where entity.audience = 'master'
        and entity.publication_status = 'published'
        and link.publication_status = 'published'
    ), '[]'::jsonb),
    'players', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id', player.id, 'display_name', player.display_name)
        order by player.id
      )
      from public.players as player
      where player.publication_status = 'published'
    ), '[]'::jsonb),
    'dispositions', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'entity_id', relation.entity_id,
          'player_id', relation.player_id,
          'disposition', relation.disposition
        ) order by relation.entity_id, relation.player_id
      )
      from public.entity_player_dispositions as relation
      join public.map_entities as entity on entity.id = relation.entity_id
      join public.players as player on player.id = relation.player_id
      where entity.audience = 'master'
        and entity.publication_status = 'published'
        and player.publication_status = 'published'
    ), '[]'::jsonb),
    'relations', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'character_id', relation.character_id,
          'location_id', relation.location_id,
          'relation_status', relation.relation_status
        ) order by relation.location_id, relation.character_id
      )
      from public.character_location_relations as relation
      join public.map_entities as character on character.id = relation.character_id
      join public.map_entities as location on location.id = relation.location_id
      where relation.publication_status = 'published'
        and character.publication_status = 'published'
        and location.publication_status = 'published'
        and (character.audience = 'master' or location.audience = 'master')
    ), '[]'::jsonb),
    'relation_entities', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', entity.id,
          'name', entity.name,
          'entity_type', entity.entity_type,
          'audience', entity.audience
        ) order by entity.id
      )
      from public.map_entities as entity
      where entity.publication_status = 'published'
        and exists (
          select 1
          from public.character_location_relations as relation
          join public.map_entities as character on character.id = relation.character_id
          join public.map_entities as location on location.id = relation.location_id
          where relation.publication_status = 'published'
            and character.publication_status = 'published'
            and location.publication_status = 'published'
            and (character.audience = 'master' or location.audience = 'master')
            and entity.id in (relation.character_id, relation.location_id)
        )
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_get_master_catalog() from public, anon;
grant execute on function public.admin_get_master_catalog() to authenticated;

comment on function public.admin_get_master_catalog() is
  'MAP-044 authorized in-memory catalog for Modo Máster. Never used by public snapshot generation.';
