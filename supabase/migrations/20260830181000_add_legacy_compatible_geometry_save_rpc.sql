begin;

-- The browser editor still speaks the historical p_x/p_y contract until MAP-061
-- introduces an area editor. This version keeps that payload working while also
-- accepting explicit geometry. Omitting p_geometry preserves an existing polygon
-- only when the caller leaves its derived representative point untouched.
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
  p_x double precision,
  p_y double precision,
  p_category_id text,
  p_publication_status public.publication_status,
  p_tag_ids text[],
  p_dispositions jsonb,
  p_player_association_ids text[],
  p_geometry jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_geometry jsonb;
  representative record;
  existing public.map_entities%rowtype;
  effective_expected_updated_at timestamptz := p_expected_updated_at;
  current_editor jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'administrative authorization required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin-map-entity:' || p_id, 0)
  );

  if p_expected_updated_at is not null then
    select entity.*
    into existing
    from public.map_entities as entity
    where entity.id = p_id
      and entity.campaign_id = p_campaign_id
    for update;

    if not found then
      raise exception using errcode = '42501', message = 'entity does not belong to selected campaign';
    end if;
    if existing.updated_at is distinct from p_expected_updated_at then
      raise exception using errcode = '40001', message = 'the entity changed while it was being edited';
    end if;
    if existing.entity_type is distinct from p_entity_type then
      raise exception using errcode = '23514', message = 'entity_type is immutable';
    end if;

    current_editor := public.admin_get_map_entity_editor_v5(p_campaign_id, p_id);
    if p_expected_relations_revision is null
       or current_editor ->> 'relations_revision' is distinct from p_expected_relations_revision then
      raise exception using errcode = '40001', message = 'entity relations changed while the editor was open';
    end if;

    if p_geometry is null then
      if existing.geometry ->> 'kind' = 'polygon' then
        if existing.x is distinct from p_x or existing.y is distinct from p_y then
          raise exception using
            errcode = '23514',
            message = 'polygon representative coordinates are derived from geometry';
        end if;
        normalized_geometry := existing.geometry;
      else
        normalized_geometry := private.normalize_map_entity_geometry(
          p_entity_type,
          pg_catalog.jsonb_build_object(
            'kind', 'point',
            'coordinates', pg_catalog.jsonb_build_object('x', p_x, 'y', p_y)
          )
        );
      end if;
    else
      normalized_geometry := private.normalize_map_entity_geometry(p_entity_type, p_geometry);
    end if;
  else
    if p_expected_relations_revision is not null then
      raise exception using errcode = '23514', message = 'new entity cannot carry an existing relation revision';
    end if;
    normalized_geometry := private.normalize_map_entity_geometry(
      p_entity_type,
      coalesce(
        p_geometry,
        pg_catalog.jsonb_build_object(
          'kind', 'point',
          'coordinates', pg_catalog.jsonb_build_object('x', p_x, 'y', p_y)
        )
      )
    );
  end if;

  select rep.x, rep.y
  into representative
  from private.map_entity_geometry_representative(normalized_geometry) as rep;

  -- For explicit changes on an existing entity, move the geometry first. This
  -- permits polygon -> point transitions while still giving v5 a fresh optimistic
  -- timestamp and the established relation/association transaction semantics.
  if p_expected_updated_at is not null
     and p_geometry is not null
     and existing.geometry is distinct from normalized_geometry then
    update public.map_entities as entity
    set geometry = normalized_geometry
    where entity.id = p_id
      and entity.campaign_id = p_campaign_id
      and entity.updated_at = p_expected_updated_at
    returning entity.updated_at into effective_expected_updated_at;

    if not found then
      raise exception using errcode = '40001', message = 'the entity changed while geometry was being saved';
    end if;
  end if;

  perform public.admin_save_map_entity_v5(
    p_campaign_id,
    p_id,
    effective_expected_updated_at,
    p_expected_relations_revision,
    p_slug,
    p_entity_type,
    p_visibility,
    p_audience,
    p_portrait_path,
    p_name,
    p_summary,
    p_description,
    representative.x,
    representative.y,
    p_category_id,
    p_publication_status,
    p_tag_ids,
    p_dispositions,
    p_player_association_ids
  );

  if p_expected_updated_at is null and (
    select entity.geometry is distinct from normalized_geometry
    from public.map_entities as entity
    where entity.id = p_id
      and entity.campaign_id = p_campaign_id
  ) then
    update public.map_entities as entity
    set geometry = normalized_geometry
    where entity.id = p_id
      and entity.campaign_id = p_campaign_id;
  end if;

  return public.admin_get_map_entity_editor_v6(p_campaign_id, p_id);
end;
$$;

revoke all on function public.admin_save_map_entity_v7(
  uuid, text, timestamptz, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, double precision, double precision,
  text, public.publication_status, text[], jsonb, text[], jsonb
) from public, anon;
grant execute on function public.admin_save_map_entity_v7(
  uuid, text, timestamptz, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, double precision, double precision,
  text, public.publication_status, text[], jsonb, text[], jsonb
) to authenticated;

comment on function public.admin_save_map_entity_v7(
  uuid, text, timestamptz, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, double precision, double precision,
  text, public.publication_status, text[], jsonb, text[], jsonb
) is
  'MAP-060 geometry-aware editor save with legacy point payload compatibility. Polygon representative x/y are derived and immutable.';

commit;
