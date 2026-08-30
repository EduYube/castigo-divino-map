begin;

-- Security-review follow-up for MAP-058.
-- v4 acquires the per-entity advisory transaction lock before any row lock. v5 must
-- use the same order so an older v4 caller and a v5 caller cannot form the cycle
-- v5(row -> advisory) / v4(advisory -> row).
create or replace function public.admin_save_map_entity_v5(
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
  p_dispositions jsonb,
  p_player_association_ids text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_player_ids text[] := coalesce(p_player_association_ids, '{}'::text[]);
  current_editor jsonb;
  base_editor jsonb;
  base_revision text;
begin
  if not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'administrative authorization required';
  end if;

  -- Keep the exact lock order established by admin_save_map_entity_v4. The same
  -- transaction can reacquire this advisory lock when v5 delegates to v4.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin-map-entity:' || p_id, 0)
  );

  if pg_catalog.cardinality(selected_player_ids) is distinct from (
    select pg_catalog.count(distinct selected.player_id)::integer
    from pg_catalog.unnest(selected_player_ids) as selected(player_id)
  ) then
    raise exception using errcode = '23514', message = 'player associations must be unique';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(selected_player_ids) as selected(player_id)
    left join public.players as player
      on player.id = selected.player_id
     and player.campaign_id = p_campaign_id
    where player.id is null
       or player.publication_status = 'archived'::public.publication_status
  ) then
    raise exception using
      errcode = '23503',
      message = 'an associated player is unavailable in the selected campaign';
  end if;

  if p_expected_updated_at is not null then
    -- The advisory lock above is intentionally acquired before this row lock.
    perform 1
    from public.map_entities as entity
    where entity.id = p_id
      and entity.campaign_id = p_campaign_id
    for update;

    current_editor := public.admin_get_map_entity_editor_v5(p_campaign_id, p_id);
    if p_expected_relations_revision is null
       or current_editor ->> 'relations_revision' is distinct from p_expected_relations_revision then
      raise exception using errcode = '40001', message = 'entity relations changed while the editor was open';
    end if;
  elsif p_expected_relations_revision is not null then
    raise exception using errcode = '23514', message = 'new entity cannot carry an existing relation revision';
  end if;

  if p_expected_updated_at is not null then
    base_editor := public.admin_get_map_entity_editor_v4(p_campaign_id, p_id);
    base_revision := base_editor ->> 'relations_revision';
  else
    base_revision := null;
  end if;

  perform public.admin_save_map_entity_v4(
    p_campaign_id,
    p_id,
    p_expected_updated_at,
    base_revision,
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

  -- Archived players are intentionally excluded from the editor selector. Their
  -- existing links therefore remain untouched, preserving campaign history.
  delete from public.entity_player_associations as association
  using public.players as player
  where association.entity_id = p_id
    and association.campaign_id = p_campaign_id
    and player.id = association.player_id
    and player.campaign_id = association.campaign_id
    and player.publication_status <> 'archived'::public.publication_status
    and not (association.player_id = any(selected_player_ids));

  insert into public.entity_player_associations (campaign_id, entity_id, player_id)
  select p_campaign_id, p_id, selected.player_id
  from pg_catalog.unnest(selected_player_ids) as selected(player_id)
  on conflict (entity_id, player_id) do nothing;

  return public.admin_get_map_entity_editor_v5(p_campaign_id, p_id);
end;
$$;

revoke all on function public.admin_save_map_entity_v5(
  uuid, text, timestamptz, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, double precision, double precision,
  text, public.publication_status, text[], jsonb, text[]
) from public, anon;
grant execute on function public.admin_save_map_entity_v5(
  uuid, text, timestamptz, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, double precision, double precision,
  text, public.publication_status, text[], jsonb, text[]
) to authenticated;

comment on function public.admin_save_map_entity_v5(
  uuid, text, timestamptz, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, double precision, double precision,
  text, public.publication_status, text[], jsonb, text[]
) is
  'MAP-058 atomic campaign-scoped entity save. Acquires the shared per-entity advisory lock before row locks to remain deadlock-safe with v4 callers.';

commit;