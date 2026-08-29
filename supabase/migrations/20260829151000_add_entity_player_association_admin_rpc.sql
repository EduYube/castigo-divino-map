begin;

-- MAP-058: focused administrative projection/mutation for the narrative association
-- dimension. It deliberately cannot read or write entity_player_dispositions.
create function public.admin_get_entity_player_association_editor_v1(
  p_campaign_id uuid,
  p_entity_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  players jsonb;
  selected_player_ids jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'administrative authorization required';
  end if;

  if not exists (
    select 1
    from public.map_entities as entity
    where entity.id = p_entity_id
      and entity.campaign_id = p_campaign_id
  ) then
    raise exception using errcode = '23503', message = 'entity is unavailable in the selected campaign';
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', player.id,
      'display_name', player.display_name,
      'accent_color', player.accent_color
    ) order by player.display_order, player.display_name, player.id
  ), '[]'::jsonb)
  into players
  from public.players as player
  where player.campaign_id = p_campaign_id
    and player.publication_status <> 'archived'::public.publication_status;

  select coalesce(pg_catalog.jsonb_agg(association.player_id order by player.display_order, player.display_name, player.id), '[]'::jsonb)
  into selected_player_ids
  from public.entity_player_associations as association
  join public.players as player
    on player.id = association.player_id
   and player.campaign_id = association.campaign_id
  where association.entity_id = p_entity_id
    and association.campaign_id = p_campaign_id
    and player.publication_status <> 'archived'::public.publication_status;

  return pg_catalog.jsonb_build_object(
    'entity_id', p_entity_id,
    'players', players,
    'selected_player_ids', selected_player_ids
  );
end;
$$;

revoke all on function public.admin_get_entity_player_association_editor_v1(uuid, text) from public, anon;
grant execute on function public.admin_get_entity_player_association_editor_v1(uuid, text) to authenticated;

create function public.admin_set_entity_player_associations_v1(
  p_campaign_id uuid,
  p_entity_id text,
  p_player_ids text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_player_ids text[] := coalesce(p_player_ids, '{}'::text[]);
begin
  if not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'administrative authorization required';
  end if;

  perform 1
  from public.map_entities as entity
  where entity.id = p_entity_id
    and entity.campaign_id = p_campaign_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'entity is unavailable in the selected campaign';
  end if;

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

  -- Only active roster rows are edited. Associations to archived players remain as history.
  delete from public.entity_player_associations as association
  using public.players as player
  where association.entity_id = p_entity_id
    and association.campaign_id = p_campaign_id
    and player.id = association.player_id
    and player.campaign_id = association.campaign_id
    and player.publication_status <> 'archived'::public.publication_status
    and not (association.player_id = any(selected_player_ids));

  insert into public.entity_player_associations (campaign_id, entity_id, player_id)
  select p_campaign_id, p_entity_id, selected.player_id
  from pg_catalog.unnest(selected_player_ids) as selected(player_id)
  on conflict (entity_id, player_id) do nothing;

  return public.admin_get_entity_player_association_editor_v1(p_campaign_id, p_entity_id);
end;
$$;

revoke all on function public.admin_set_entity_player_associations_v1(uuid, text, text[]) from public, anon;
grant execute on function public.admin_set_entity_player_associations_v1(uuid, text, text[]) to authenticated;

comment on function public.admin_set_entity_player_associations_v1(uuid, text, text[]) is
  'MAP-058 focused association mutation. Campaign-bound and independent from player dispositions.';

commit;
