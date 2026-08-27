begin;

create or replace function public.admin_get_map_entity_editor_v4(
  p_campaign_id uuid,
  p_entity_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'administrative authorization required';
  end if;

  if not exists (
    select 1
    from public.map_entities entity
    where entity.id = p_entity_id
      and entity.campaign_id = p_campaign_id
  ) then
    raise exception using errcode = '42501', message = 'entity does not belong to selected campaign';
  end if;

  return public.admin_get_map_entity_editor_v3(p_entity_id);
end;
$$;

revoke all on function public.admin_get_map_entity_editor_v4(uuid, text) from public, anon;
grant execute on function public.admin_get_map_entity_editor_v4(uuid, text) to authenticated;

create or replace function public.admin_save_map_entity_v4(
  p_campaign_id uuid,
  p_id text,
  p_expected_updated_at timestamptz,
  p_expected_relations_revision text,
  p_slug text,
  p_entity_type public.entity_type,
  p_visibility public.map_visibility,
  p_audience public.entity_audience,
  p_portrait_path text,
  p_name text,
  p_summary text,
  p_description text,
  p_x double precision,
  p_y double precision,
  p_category_id text,
  p_publication_status public.publication_status,
  p_tag_ids text[],
  p_dispositions jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.map_entities%rowtype;
  inserted_updated_at timestamptz;
  effective_updated_at timestamptz;
  editor jsonb;
  relation_revision text;
  selected_tag_ids text[] := coalesce(p_tag_ids, '{}'::text[]);
begin
  if not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'administrative authorization required';
  end if;

  if not exists (
    select 1 from public.campaigns campaign
    where campaign.id = p_campaign_id
  ) then
    raise exception using errcode = '23514', message = 'selected campaign does not exist';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin-map-entity:' || p_id, 0)
  );

  if pg_catalog.cardinality(selected_tag_ids) is distinct from (
    select pg_catalog.count(distinct selected.tag_id)::integer
    from pg_catalog.unnest(selected_tag_ids) as selected(tag_id)
  ) then
    raise exception using errcode = '23514', message = 'entity tags must be unique';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(selected_tag_ids) as selected(tag_id)
    left join public.tags tag
      on tag.id = selected.tag_id
     and tag.campaign_id = p_campaign_id
    where tag.id is null
      or tag.publication_status = 'archived'::public.publication_status
  ) then
    raise exception using errcode = '23503', message = 'a selected tag is unavailable in the selected campaign';
  end if;

  if not exists (
    select 1
    from public.categories category
    where category.id = p_category_id
      and category.campaign_id = p_campaign_id
      and category.publication_status <> 'archived'::public.publication_status
  ) then
    raise exception using errcode = '23503', message = 'the selected category is unavailable in the selected campaign';
  end if;

  if pg_catalog.jsonb_typeof(p_dispositions) is distinct from 'array' then
    raise exception using errcode = '23514', message = 'dispositions must be an array';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_dispositions)
      as input(player_id text, "playerId" text, disposition text)
    left join public.players player
      on player.id = coalesce(input."playerId", input.player_id)
     and player.campaign_id = p_campaign_id
    where coalesce(input."playerId", input.player_id) is null
      or player.id is null
  ) then
    raise exception using errcode = '23503', message = 'a disposition player is unavailable in the selected campaign';
  end if;

  if p_expected_updated_at is null then
    if p_expected_relations_revision is not null then
      raise exception using errcode = '23514', message = 'new entity cannot carry an existing relation revision';
    end if;

    if exists (select 1 from public.map_entities entity where entity.id = p_id) then
      raise exception using errcode = '40001', message = 'entity identity already exists';
    end if;

    -- Keep creation inside the established SECURITY INVOKER column-privilege
    -- boundary. MAP-045 intentionally grants portrait_path only for UPDATE, so the
    -- stub row leaves it NULL and v3 applies p_portrait_path later in this same
    -- transaction through its authorized UPDATE path.
    insert into public.map_entities (
      campaign_id,
      id,
      slug,
      entity_type,
      visibility,
      audience,
      name,
      name_language,
      summary,
      description,
      x,
      y,
      category_id,
      publication_status
    ) values (
      p_campaign_id,
      p_id,
      p_slug,
      p_entity_type,
      p_visibility,
      p_audience,
      p_name,
      'en',
      p_summary,
      p_description,
      p_x,
      p_y,
      p_category_id,
      'draft'::public.publication_status
    )
    returning updated_at into inserted_updated_at;
    effective_updated_at := inserted_updated_at;
  else
    select entity.*
    into existing
    from public.map_entities entity
    where entity.id = p_id
    for update;

    if not found or existing.campaign_id is distinct from p_campaign_id then
      raise exception using errcode = '42501', message = 'entity does not belong to selected campaign';
    end if;

    if existing.updated_at is distinct from p_expected_updated_at then
      raise exception using errcode = '40001', message = 'the entity changed while it was being edited';
    end if;

    perform 1
    from public.entity_tags link
    where link.entity_id = p_id
      and link.campaign_id = p_campaign_id
    for update;

    perform 1
    from public.entity_player_dispositions relation
    where relation.entity_id = p_id
      and relation.campaign_id = p_campaign_id
    for update;

    editor := public.admin_get_map_entity_editor_v3(p_id);
    relation_revision := editor ->> 'relations_revision';
    if p_expected_relations_revision is null
       or relation_revision is distinct from p_expected_relations_revision then
      raise exception using errcode = '40001', message = 'entity relations changed while the editor was open';
    end if;
    effective_updated_at := p_expected_updated_at;
  end if;

  -- v1-v3 omit campaign_id when creating relation rows for backwards compatibility.
  -- Pre-create every new selected tag link in the authoritative campaign so v3 can
  -- retain its mature optimistic-concurrency/update logic without falling through
  -- the initial-campaign DEFAULT introduced by MAP-053.
  insert into public.entity_tags (
    campaign_id,
    id,
    entity_id,
    tag_id,
    publication_status
  )
  select
    p_campaign_id,
    'entity-tag-' || pg_catalog.substr(pg_catalog.md5(p_id || ':' || selected.tag_id), 1, 24),
    p_id,
    selected.tag_id,
    'draft'::public.publication_status
  from pg_catalog.unnest(selected_tag_ids) as selected(tag_id)
  where not exists (
    select 1
    from public.entity_tags link
    where link.entity_id = p_id
      and link.tag_id = selected.tag_id
      and link.campaign_id = p_campaign_id
  );

  editor := public.admin_get_map_entity_editor_v3(p_id);
  relation_revision := editor ->> 'relations_revision';

  perform public.admin_save_map_entity_v3(
    p_id,
    effective_updated_at,
    relation_revision,
    p_slug,
    p_entity_type,
    p_visibility,
    p_audience,
    p_portrait_path,
    p_name,
    p_summary,
    p_description,
    p_x,
    p_y,
    p_category_id,
    p_publication_status,
    selected_tag_ids,
    p_dispositions
  );

  return public.admin_get_map_entity_editor_v4(p_campaign_id, p_id);
end;
$$;

revoke all on function public.admin_save_map_entity_v4(
  uuid, text, timestamptz, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, double precision, double precision,
  text, public.publication_status, text[], jsonb
) from public, anon;
grant execute on function public.admin_save_map_entity_v4(
  uuid, text, timestamptz, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, double precision, double precision,
  text, public.publication_status, text[], jsonb
) to authenticated;

create or replace function public.admin_moderate_public_request_v2(
  p_campaign_id uuid,
  p_request_id uuid,
  p_expected_updated_at timestamptz,
  p_action text,
  p_moderation_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'administrative authorization required';
  end if;

  if not exists (
    select 1
    from public.public_requests request
    where request.id = p_request_id
      and request.campaign_id = p_campaign_id
  ) then
    raise exception using errcode = '42501', message = 'request does not belong to selected campaign';
  end if;

  return public.admin_moderate_public_request(
    p_request_id,
    p_expected_updated_at,
    p_action,
    p_moderation_note
  );
end;
$$;

revoke all on function public.admin_moderate_public_request_v2(uuid, uuid, timestamptz, text, text)
  from public, anon;
grant execute on function public.admin_moderate_public_request_v2(uuid, uuid, timestamptz, text, text)
  to authenticated;

commit;
