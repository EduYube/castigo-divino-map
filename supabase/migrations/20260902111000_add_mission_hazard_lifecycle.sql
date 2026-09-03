-- MAP-064 phase 2: functional lifecycle, secured admin editing, and Master projection.
-- Public proposal hardening is intentionally installed atomically with the enum
-- expansion in phase 1, before mission/hazard can become externally visible.

begin;

create type public.entity_lifecycle_status as enum ('active', 'completed', 'failed', 'resolved');

alter table public.map_entities
  add column lifecycle_status public.entity_lifecycle_status;

-- Keep the MAP-060 SECURITY INVOKER model: authenticated callers receive only
-- the lifecycle column privilege required by admin_save_map_entity_v7. RLS and
-- the RPC's explicit admin authorization remain the row-level boundary.
grant update (lifecycle_status) on public.map_entities to authenticated;

create function private.default_map_entity_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.lifecycle_status is null
     and new.entity_type in ('mission'::public.entity_type, 'hazard'::public.entity_type) then
    new.lifecycle_status := 'active'::public.entity_lifecycle_status;
  end if;
  return new;
end;
$$;

revoke all on function private.default_map_entity_lifecycle() from public, anon, authenticated;

create trigger map_entities_default_functional_lifecycle
before insert on public.map_entities
for each row execute function private.default_map_entity_lifecycle();

alter table public.map_entities
  add constraint map_entities_functional_lifecycle_check
  check (
    (entity_type in ('character'::public.entity_type, 'location'::public.entity_type)
      and lifecycle_status is null)
    or (entity_type = 'mission'::public.entity_type
      and lifecycle_status in (
        'active'::public.entity_lifecycle_status,
        'completed'::public.entity_lifecycle_status,
        'failed'::public.entity_lifecycle_status
      ))
    or (entity_type = 'hazard'::public.entity_type
      and lifecycle_status in (
        'active'::public.entity_lifecycle_status,
        'resolved'::public.entity_lifecycle_status
      ))
  );

create function public.admin_get_map_entity_editor_v7(
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
  entity_lifecycle public.entity_lifecycle_status;
begin
  editor := public.admin_get_map_entity_editor_v6(p_campaign_id, p_entity_id);

  select entity.lifecycle_status
  into entity_lifecycle
  from public.map_entities as entity
  where entity.id = p_entity_id
    and entity.campaign_id = p_campaign_id;

  return pg_catalog.jsonb_set(
    editor,
    '{record,lifecycleStatus}',
    coalesce(pg_catalog.to_jsonb(entity_lifecycle), 'null'::jsonb),
    true
  );
end;
$$;

revoke all on function public.admin_get_map_entity_editor_v7(uuid, text) from public, anon;
grant execute on function public.admin_get_map_entity_editor_v7(uuid, text) to authenticated;

create function public.admin_save_map_entity_v7(
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
  p_geometry jsonb,
  p_category_id text,
  p_publication_status public.publication_status,
  p_tag_ids text[],
  p_dispositions jsonb,
  p_player_association_ids text[],
  p_lifecycle_status public.entity_lifecycle_status
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_lifecycle public.entity_lifecycle_status := p_lifecycle_status;
begin
  if not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'administrative authorization required';
  end if;

  if p_entity_type in ('character'::public.entity_type, 'location'::public.entity_type) then
    if normalized_lifecycle is not null then
      raise exception using errcode = '23514', message = 'legacy entity class cannot carry functional lifecycle';
    end if;
  elsif p_entity_type = 'mission'::public.entity_type then
    normalized_lifecycle := coalesce(normalized_lifecycle, 'active'::public.entity_lifecycle_status);
    if normalized_lifecycle not in (
      'active'::public.entity_lifecycle_status,
      'completed'::public.entity_lifecycle_status,
      'failed'::public.entity_lifecycle_status
    ) then
      raise exception using errcode = '23514', message = 'invalid mission lifecycle';
    end if;
  elsif p_entity_type = 'hazard'::public.entity_type then
    normalized_lifecycle := coalesce(normalized_lifecycle, 'active'::public.entity_lifecycle_status);
    if normalized_lifecycle not in (
      'active'::public.entity_lifecycle_status,
      'resolved'::public.entity_lifecycle_status
    ) then
      raise exception using errcode = '23514', message = 'invalid hazard lifecycle';
    end if;
  else
    raise exception using errcode = '23514', message = 'unsupported entity class';
  end if;

  -- Match MAP-058/MAP-060 lock ordering. The same transaction-level advisory lock
  -- is re-entrant when v6 acquires it again.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin-map-entity:' || p_id, 0)
  );

  perform public.admin_save_map_entity_v6(
    p_campaign_id, p_id, p_expected_updated_at, p_expected_relations_revision,
    p_slug, p_entity_type, p_visibility, p_audience, p_portrait_path,
    p_name, p_summary, p_description, p_geometry, p_category_id,
    p_publication_status, p_tag_ids, p_dispositions, p_player_association_ids
  );

  update public.map_entities as entity
  set lifecycle_status = normalized_lifecycle
  where entity.id = p_id
    and entity.campaign_id = p_campaign_id
    and entity.lifecycle_status is distinct from normalized_lifecycle;

  return public.admin_get_map_entity_editor_v7(p_campaign_id, p_id);
end;
$$;

revoke all on function public.admin_save_map_entity_v7(
  uuid, text, timestamptz, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, jsonb, text,
  public.publication_status, text[], jsonb, text[], public.entity_lifecycle_status
) from public, anon;
grant execute on function public.admin_save_map_entity_v7(
  uuid, text, timestamptz, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, jsonb, text,
  public.publication_status, text[], jsonb, text[], public.entity_lifecycle_status
) to authenticated;

create function public.admin_get_master_catalog_v6(p_campaign_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
  entities jsonb;
begin
  result := public.admin_get_master_catalog_v5(p_campaign_id);

  select coalesce(pg_catalog.jsonb_agg(
    source_entity.value || pg_catalog.jsonb_build_object('lifecycle_status', entity.lifecycle_status)
    order by entity.id
  ), '[]'::jsonb)
  into entities
  from pg_catalog.jsonb_array_elements(result -> 'entities') as source_entity(value)
  join public.map_entities as entity
    on entity.id = source_entity.value ->> 'id'
   and entity.campaign_id = p_campaign_id;

  return pg_catalog.jsonb_set(result, '{entities}', entities, true);
end;
$$;

revoke all on function public.admin_get_master_catalog_v6(uuid) from public, anon;
grant execute on function public.admin_get_master_catalog_v6(uuid) to authenticated;

comment on type public.entity_lifecycle_status is
  'MAP-064 functional lifecycle. Valid values are constrained by entity_type and remain independent from publication_status.';
comment on column public.map_entities.lifecycle_status is
  'MAP-064 mission/hazard lifecycle. NULL for character/location; never substitutes publication archived state.';
comment on function public.admin_save_map_entity_v7(
  uuid, text, timestamptz, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, jsonb, text,
  public.publication_status, text[], jsonb, text[], public.entity_lifecycle_status
) is
  'MAP-064 campaign-scoped atomic admin save with independent functional lifecycle.';
comment on function public.admin_get_master_catalog_v6(uuid) is
  'MAP-064 authorized campaign-scoped Master catalog including functional lifecycle.';

commit;
