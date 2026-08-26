begin;

create or replace function public.admin_get_map_entity_editor_v4(
  p_campaign_id uuid,
  p_entity_id text
)
returns jsonb
language plpgsql
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
set search_path = ''
as $$
declare
  inserted_updated_at timestamptz;
  editor jsonb;
  relation_revision text;
begin
  if not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'administrative authorization required';
  end if;

  if not exists (select 1 from public.campaigns campaign where campaign.id = p_campaign_id) then
    raise exception using errcode = '23514', message = 'selected campaign does not exist';
  end if;

  if p_expected_updated_at is null then
    if p_expected_relations_revision is not null then
      raise exception using errcode = '23514', message = 'new entity cannot carry an existing relation revision';
    end if;

    if exists (select 1 from public.map_entities entity where entity.id = p_id) then
      raise exception using errcode = '40001', message = 'entity identity already exists';
    end if;

    insert into public.map_entities (
      campaign_id,
      id,
      slug,
      entity_type,
      visibility,
      audience,
      portrait_path,
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
      p_portrait_path,
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

    editor := public.admin_get_map_entity_editor_v3(p_id);
    relation_revision := editor ->> 'relations_revision';

    return public.admin_save_map_entity_v3(
      p_id,
      inserted_updated_at,
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
      p_tag_ids,
      p_dispositions
    );
  end if;

  if not exists (
    select 1
    from public.map_entities entity
    where entity.id = p_id
      and entity.campaign_id = p_campaign_id
  ) then
    raise exception using errcode = '42501', message = 'entity does not belong to selected campaign';
  end if;

  return public.admin_save_map_entity_v3(
    p_id,
    p_expected_updated_at,
    p_expected_relations_revision,
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
    p_tag_ids,
    p_dispositions
  );
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
