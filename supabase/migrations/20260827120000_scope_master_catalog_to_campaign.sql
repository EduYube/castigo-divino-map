begin;

-- MAP-055: campaign-scoped private read model for Modo Máster.
--
-- The legacy v1/v2 RPCs remain untouched for backwards compatibility. The public
-- multicampaign runtime uses only this versioned function, which builds the result
-- directly from rows in the requested active campaign. It deliberately does not
-- fetch a global private catalog and filter it in the browser or in JSON afterwards.
create function public.admin_get_master_catalog_v3(p_campaign_id uuid)
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

  if not exists (
    select 1
    from public.campaigns as campaign
    where campaign.id = p_campaign_id
      and campaign.status = 'active'
  ) then
    raise exception using
      errcode = '22023',
      message = 'active campaign required';
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
          'portrait_path', entity.portrait_path,
          'x', entity.x,
          'y', entity.y,
          'category_id', entity.category_id,
          'updated_at', entity.updated_at
        ) order by entity.id
      )
      from public.map_entities as entity
      where entity.campaign_id = p_campaign_id
        and entity.audience = 'master'
        and entity.publication_status = 'published'
    ), '[]'::jsonb),
    'categories', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id', category.id, 'name', category.name)
        order by category.id
      )
      from public.categories as category
      where category.campaign_id = p_campaign_id
        and exists (
          select 1
          from public.map_entities as entity
          where entity.campaign_id = p_campaign_id
            and entity.audience = 'master'
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
      join public.map_entities as entity
        on entity.id = alias.entity_id
       and entity.campaign_id = alias.campaign_id
      where alias.campaign_id = p_campaign_id
        and entity.audience = 'master'
        and entity.publication_status = 'published'
        and alias.publication_status = 'published'
    ), '[]'::jsonb),
    'tags', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id', tag.id, 'name', tag.name)
        order by tag.id
      )
      from public.tags as tag
      where tag.campaign_id = p_campaign_id
        and exists (
          select 1
          from public.entity_tags as link
          join public.map_entities as entity
            on entity.id = link.entity_id
           and entity.campaign_id = link.campaign_id
          where link.campaign_id = p_campaign_id
            and entity.audience = 'master'
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
      join public.map_entities as entity
        on entity.id = link.entity_id
       and entity.campaign_id = link.campaign_id
      where link.campaign_id = p_campaign_id
        and entity.audience = 'master'
        and entity.publication_status = 'published'
        and link.publication_status = 'published'
    ), '[]'::jsonb),
    'players', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id', player.id, 'display_name', player.display_name)
        order by player.id
      )
      from public.players as player
      where player.campaign_id = p_campaign_id
        and player.publication_status = 'published'
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
      join public.map_entities as entity
        on entity.id = relation.entity_id
       and entity.campaign_id = relation.campaign_id
      join public.players as player
        on player.id = relation.player_id
       and player.campaign_id = relation.campaign_id
      where relation.campaign_id = p_campaign_id
        and entity.audience = 'master'
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
      join public.map_entities as character
        on character.id = relation.character_id
       and character.campaign_id = relation.campaign_id
      join public.map_entities as location
        on location.id = relation.location_id
       and location.campaign_id = relation.campaign_id
      where relation.campaign_id = p_campaign_id
        and relation.publication_status = 'published'
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
      where entity.campaign_id = p_campaign_id
        and entity.publication_status = 'published'
        and exists (
          select 1
          from public.character_location_relations as relation
          join public.map_entities as character
            on character.id = relation.character_id
           and character.campaign_id = relation.campaign_id
          join public.map_entities as location
            on location.id = relation.location_id
           and location.campaign_id = relation.campaign_id
          where relation.campaign_id = p_campaign_id
            and relation.publication_status = 'published'
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

revoke all on function public.admin_get_master_catalog_v3(uuid) from public, anon;
grant execute on function public.admin_get_master_catalog_v3(uuid) to authenticated;

comment on function public.admin_get_master_catalog_v3(uuid) is
  'MAP-055 authorized in-memory Master catalog scoped to one active campaign. Never used by public snapshot generation.';

commit;
