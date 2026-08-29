begin;

-- MAP-058: narrative entity <-> player associations are a domain dimension that is
-- deliberately independent from entity_player_dispositions.
create table public.entity_player_associations (
  campaign_id uuid not null,
  entity_id text not null,
  player_id text not null,
  created_at timestamptz not null default now(),
  primary key (entity_id, player_id),
  constraint entity_player_associations_campaign_fk
    foreign key (campaign_id) references public.campaigns(id) on delete restrict,
  constraint entity_player_associations_entity_campaign_fk
    foreign key (entity_id, campaign_id)
    references public.map_entities(id, campaign_id) on delete restrict,
  constraint entity_player_associations_player_campaign_fk
    foreign key (player_id, campaign_id)
    references public.players(id, campaign_id) on delete restrict
);

create index entity_player_associations_campaign_entity_idx
  on public.entity_player_associations(campaign_id, entity_id);
create index entity_player_associations_campaign_player_idx
  on public.entity_player_associations(campaign_id, player_id);

alter table public.entity_player_associations enable row level security;

create policy entity_player_associations_public_select
on public.entity_player_associations
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.map_entities as entity
    where entity.id = entity_player_associations.entity_id
      and entity.campaign_id = entity_player_associations.campaign_id
      and entity.audience = 'public'::public.entity_audience
      and entity.publication_status = 'published'::public.publication_status
  )
  and exists (
    select 1
    from public.players as player
    where player.id = entity_player_associations.player_id
      and player.campaign_id = entity_player_associations.campaign_id
      and player.publication_status = 'published'::public.publication_status
  )
);

create policy entity_player_associations_admin_all
on public.entity_player_associations
for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

revoke all on public.entity_player_associations from public, anon, authenticated;
grant select (campaign_id, entity_id, player_id) on public.entity_player_associations to anon;
grant select (campaign_id, entity_id, player_id, created_at), insert (campaign_id, entity_id, player_id), delete
  on public.entity_player_associations to authenticated;

-- Campaign-scoped editor read model. The v4 payload remains the compatibility base;
-- v5 adds associations and folds them into the optimistic relation revision.
create function public.admin_get_map_entity_editor_v5(
  p_campaign_id uuid,
  p_entity_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  editor jsonb;
  associations jsonb;
  association_revision text;
  blocker_count bigint;
begin
  editor := public.admin_get_map_entity_editor_v4(p_campaign_id, p_entity_id);

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'player_id', association.player_id,
      'display_name', player.display_name,
      'accent_color', player.accent_color,
      'publication_status', player.publication_status,
      'created_at', association.created_at
    ) order by player.display_order, player.display_name, player.id
  ), '[]'::jsonb),
  pg_catalog.md5(
    coalesce(editor ->> 'relations_revision', '') || '#' ||
    coalesce(pg_catalog.string_agg(
      association.player_id || ':' || association.created_at::text,
      '|' order by association.player_id
    ), '')
  ),
  pg_catalog.count(*)
  into associations, association_revision, blocker_count
  from public.entity_player_associations as association
  join public.players as player
    on player.id = association.player_id
   and player.campaign_id = association.campaign_id
  where association.entity_id = p_entity_id
    and association.campaign_id = p_campaign_id;

  return pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      editor || pg_catalog.jsonb_build_object(
        'associations', associations,
        'relations_revision', association_revision
      ),
      '{delete_blockers,player_associations}',
      pg_catalog.to_jsonb(blocker_count),
      true
    ),
    '{relations_revision}',
    pg_catalog.to_jsonb(association_revision),
    true
  );
end;
$$;

revoke all on function public.admin_get_map_entity_editor_v5(uuid, text) from public, anon;
grant execute on function public.admin_get_map_entity_editor_v5(uuid, text) to authenticated;

create function public.admin_save_map_entity_v5(
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
    perform 1
    from public.entity_player_associations as association
    where association.entity_id = p_id
      and association.campaign_id = p_campaign_id
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

-- Authorized Master read model. This version augments the existing scoped v3 result;
-- it never exposes Master associations through the public catalog path.
create function public.admin_get_master_catalog_v4(p_campaign_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
  players jsonb;
  associations jsonb;
begin
  result := public.admin_get_master_catalog_v3(p_campaign_id);

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
    and player.publication_status = 'published'::public.publication_status;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'entity_id', association.entity_id,
      'player_id', association.player_id
    ) order by association.entity_id, player.display_order, player.id
  ), '[]'::jsonb)
  into associations
  from public.entity_player_associations as association
  join public.map_entities as entity
    on entity.id = association.entity_id
   and entity.campaign_id = association.campaign_id
  join public.players as player
    on player.id = association.player_id
   and player.campaign_id = association.campaign_id
  where association.campaign_id = p_campaign_id
    and entity.audience = 'master'::public.entity_audience
    and entity.publication_status = 'published'::public.publication_status
    and player.publication_status = 'published'::public.publication_status;

  return result || pg_catalog.jsonb_build_object(
    'players', players,
    'associations', associations
  );
end;
$$;

revoke all on function public.admin_get_master_catalog_v4(uuid) from public, anon;
grant execute on function public.admin_get_master_catalog_v4(uuid) to authenticated;

comment on table public.entity_player_associations is
  'MAP-058 narrative entity/player associations. Independent from dispositions and campaign-bound by composite foreign keys.';
comment on function public.admin_get_master_catalog_v4(uuid) is
  'MAP-058 authorized Master catalog with player accents and narrative associations. Never used by public snapshot generation.';

commit;
