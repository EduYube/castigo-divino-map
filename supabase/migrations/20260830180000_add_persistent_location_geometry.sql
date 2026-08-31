begin;

-- MAP-060: make geometry an explicit, campaign-bound property of map_entities.
-- x/y remain as a backwards-compatible representative projection. For point
-- geometries they are the point itself; for polygons they are the deterministic
-- bounding-box centre. The geometry trigger keeps that projection one-way so a
-- polygon never gains a second editable position.
alter table public.map_entities
  add column geometry jsonb;

-- Backfilling an already published/edited entity must not rewrite its editorial
-- history or stale-write token. Geometry is derived mechanically from the
-- existing x/y coordinates during this migration only.
alter table public.map_entities disable trigger "90_map_entity_updated_at";

update public.map_entities
set geometry = pg_catalog.jsonb_build_object(
  'kind', 'point',
  'coordinates', pg_catalog.jsonb_build_object('x', x, 'y', y)
);

alter table public.map_entities enable trigger "90_map_entity_updated_at";

alter table public.map_entities
  alter column geometry set not null;

create function private.map_geometry_segments_intersect(
  ax double precision,
  ay double precision,
  bx double precision,
  by double precision,
  cx double precision,
  cy double precision,
  dx double precision,
  dy double precision
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  ab_c double precision := (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  ab_d double precision := (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  cd_a double precision := (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  cd_b double precision := (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  epsilon constant double precision := 1e-9;
begin
  if ((ab_c > epsilon and ab_d < -epsilon) or (ab_c < -epsilon and ab_d > epsilon))
     and ((cd_a > epsilon and cd_b < -epsilon) or (cd_a < -epsilon and cd_b > epsilon)) then
    return true;
  end if;

  if pg_catalog.abs(ab_c) <= epsilon
     and cx between least(ax, bx) - epsilon and greatest(ax, bx) + epsilon
     and cy between least(ay, by) - epsilon and greatest(ay, by) + epsilon then
    return true;
  end if;
  if pg_catalog.abs(ab_d) <= epsilon
     and dx between least(ax, bx) - epsilon and greatest(ax, bx) + epsilon
     and dy between least(ay, by) - epsilon and greatest(ay, by) + epsilon then
    return true;
  end if;
  if pg_catalog.abs(cd_a) <= epsilon
     and ax between least(cx, dx) - epsilon and greatest(cx, dx) + epsilon
     and ay between least(cy, dy) - epsilon and greatest(cy, dy) + epsilon then
    return true;
  end if;
  if pg_catalog.abs(cd_b) <= epsilon
     and bx between least(cx, dx) - epsilon and greatest(cx, dx) + epsilon
     and by between least(cy, dy) - epsilon and greatest(cy, dy) + epsilon then
    return true;
  end if;

  return false;
end;
$$;

create function private.normalize_map_entity_geometry(
  p_entity_type public.entity_type,
  p_geometry jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  kind text;
  vertices jsonb;
  vertex_count integer;
  xs double precision[] := '{}'::double precision[];
  ys double precision[] := '{}'::double precision[];
  reversed_xs double precision[] := '{}'::double precision[];
  reversed_ys double precision[] := '{}'::double precision[];
  canonical_vertices jsonb := '[]'::jsonb;
  x_value double precision;
  y_value double precision;
  area_twice double precision := 0;
  first_index integer := 1;
  next_index integer;
  output_index integer;
  epsilon constant double precision := 1e-9;
begin
  if pg_catalog.jsonb_typeof(p_geometry) is distinct from 'object' then
    raise exception using errcode = '23514', message = 'map geometry must be an object';
  end if;

  kind := p_geometry ->> 'kind';

  if kind = 'point' then
    if pg_catalog.jsonb_typeof(p_geometry -> 'coordinates') is distinct from 'object' then
      raise exception using errcode = '23514', message = 'point geometry requires coordinates';
    end if;

    begin
      x_value := (p_geometry #>> '{coordinates,x}')::double precision;
      y_value := (p_geometry #>> '{coordinates,y}')::double precision;
    exception when others then
      raise exception using errcode = '23514', message = 'point geometry coordinates must be numeric';
    end;

    if x_value not between 0 and 3600
       or y_value not between 0 and 2329
       or x_value in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
       or y_value in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision) then
      raise exception using errcode = '23514', message = 'point geometry is outside map bounds';
    end if;

    return pg_catalog.jsonb_build_object(
      'kind', 'point',
      'coordinates', pg_catalog.jsonb_build_object('x', x_value, 'y', y_value)
    );
  end if;

  if kind is distinct from 'polygon' then
    raise exception using errcode = '23514', message = 'map geometry kind must be point or polygon';
  end if;

  if p_entity_type is distinct from 'location'::public.entity_type then
    raise exception using errcode = '23514', message = 'characters must use point geometry';
  end if;

  vertices := p_geometry -> 'vertices';
  if pg_catalog.jsonb_typeof(vertices) is distinct from 'array' then
    raise exception using errcode = '23514', message = 'polygon geometry requires vertices';
  end if;

  vertex_count := pg_catalog.jsonb_array_length(vertices);
  if vertex_count < 3 then
    raise exception using errcode = '23514', message = 'polygon geometry requires at least three vertices';
  end if;
  if vertex_count > 64 then
    raise exception using errcode = '23514', message = 'polygon geometry exceeds the 64 vertex limit';
  end if;

  for i in 0..vertex_count - 1 loop
    if pg_catalog.jsonb_typeof(vertices -> i) is distinct from 'object' then
      raise exception using errcode = '23514', message = 'polygon vertices must be coordinate objects';
    end if;
    begin
      x_value := ((vertices -> i) ->> 'x')::double precision;
      y_value := ((vertices -> i) ->> 'y')::double precision;
    exception when others then
      raise exception using errcode = '23514', message = 'polygon vertex coordinates must be numeric';
    end;

    if x_value not between 0 and 3600
       or y_value not between 0 and 2329
       or x_value in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
       or y_value in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision) then
      raise exception using errcode = '23514', message = 'polygon geometry is outside map bounds';
    end if;

    xs := pg_catalog.array_append(xs, x_value);
    ys := pg_catalog.array_append(ys, y_value);
  end loop;

  -- Repeated vertices make canonical rotation ambiguous and introduce degenerate
  -- edges. Polygons use implicit closure: the first vertex must not be repeated.
  for i in 1..vertex_count loop
    for j in i + 1..vertex_count loop
      if xs[i] = xs[j] and ys[i] = ys[j] then
        raise exception using errcode = '23514', message = 'polygon geometry cannot repeat vertices';
      end if;
    end loop;
  end loop;

  for i in 1..vertex_count loop
    next_index := case when i = vertex_count then 1 else i + 1 end;
    area_twice := area_twice + xs[i] * ys[next_index] - xs[next_index] * ys[i];
  end loop;

  if pg_catalog.abs(area_twice) <= epsilon then
    raise exception using errcode = '23514', message = 'polygon geometry must have non-zero area';
  end if;

  -- Reject any intersection between non-adjacent edges, including touching or
  -- overlapping collinear segments. With the bounded 64-vertex contract the
  -- quadratic check is deterministic and cheap.
  for i in 1..vertex_count loop
    next_index := case when i = vertex_count then 1 else i + 1 end;
    for j in i + 1..vertex_count loop
      if j = i + 1 or (i = 1 and j = vertex_count) then
        continue;
      end if;
      if private.map_geometry_segments_intersect(
        xs[i], ys[i], xs[next_index], ys[next_index],
        xs[j], ys[j],
        xs[case when j = vertex_count then 1 else j + 1 end],
        ys[case when j = vertex_count then 1 else j + 1 end]
      ) then
        raise exception using errcode = '23514', message = 'polygon geometry cannot self-intersect';
      end if;
    end loop;
  end loop;

  -- Canonical orientation is counter-clockwise in stored x/y space.
  if area_twice < 0 then
    for i in reverse vertex_count..1 loop
      reversed_xs := pg_catalog.array_append(reversed_xs, xs[i]);
      reversed_ys := pg_catalog.array_append(reversed_ys, ys[i]);
    end loop;
    xs := reversed_xs;
    ys := reversed_ys;
  end if;

  -- Canonical rotation starts at the lexicographically smallest (x,y) vertex.
  for i in 2..vertex_count loop
    if xs[i] < xs[first_index] or (xs[i] = xs[first_index] and ys[i] < ys[first_index]) then
      first_index := i;
    end if;
  end loop;

  for i in 0..vertex_count - 1 loop
    output_index := ((first_index - 1 + i) % vertex_count) + 1;
    canonical_vertices := canonical_vertices || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('x', xs[output_index], 'y', ys[output_index])
    );
  end loop;

  return pg_catalog.jsonb_build_object('kind', 'polygon', 'vertices', canonical_vertices);
end;
$$;

create function private.map_entity_geometry_representative(p_geometry jsonb)
returns table(x double precision, y double precision)
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  vertex jsonb;
  min_x double precision := 'Infinity'::double precision;
  max_x double precision := '-Infinity'::double precision;
  min_y double precision := 'Infinity'::double precision;
  max_y double precision := '-Infinity'::double precision;
begin
  if p_geometry ->> 'kind' = 'point' then
    x := (p_geometry #>> '{coordinates,x}')::double precision;
    y := (p_geometry #>> '{coordinates,y}')::double precision;
    return next;
    return;
  end if;

  for vertex in select value from pg_catalog.jsonb_array_elements(p_geometry -> 'vertices') loop
    min_x := least(min_x, (vertex ->> 'x')::double precision);
    max_x := greatest(max_x, (vertex ->> 'x')::double precision);
    min_y := least(min_y, (vertex ->> 'y')::double precision);
    max_y := greatest(max_y, (vertex ->> 'y')::double precision);
  end loop;

  x := (min_x + max_x) / 2;
  y := (min_y + max_y) / 2;
  return next;
end;
$$;

create function private.enforce_map_entity_geometry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized jsonb;
  representative record;
begin
  if tg_op = 'INSERT' then
    normalized := private.normalize_map_entity_geometry(
      new.entity_type,
      coalesce(
        new.geometry,
        pg_catalog.jsonb_build_object(
          'kind', 'point',
          'coordinates', pg_catalog.jsonb_build_object('x', new.x, 'y', new.y)
        )
      )
    );
  elsif new.entity_type is distinct from old.entity_type
        or new.geometry is distinct from old.geometry then
    normalized := private.normalize_map_entity_geometry(new.entity_type, new.geometry);
  elsif new.x is distinct from old.x or new.y is distinct from old.y then
    if old.geometry ->> 'kind' <> 'point' then
      raise exception using
        errcode = '23514',
        message = 'polygon representative coordinates are derived from geometry';
    end if;
    normalized := private.normalize_map_entity_geometry(
      new.entity_type,
      pg_catalog.jsonb_build_object(
        'kind', 'point',
        'coordinates', pg_catalog.jsonb_build_object('x', new.x, 'y', new.y)
      )
    );
  else
    return new;
  end if;

  select rep.x, rep.y
  into representative
  from private.map_entity_geometry_representative(normalized) as rep;

  new.geometry := normalized;
  new.x := representative.x;
  new.y := representative.y;
  return new;
end;
$$;

revoke all on function private.map_geometry_segments_intersect(
  double precision, double precision, double precision, double precision,
  double precision, double precision, double precision, double precision
) from public, anon;
revoke all on function private.normalize_map_entity_geometry(public.entity_type, jsonb) from public, anon;
revoke all on function private.map_entity_geometry_representative(jsonb) from public, anon;
revoke all on function private.enforce_map_entity_geometry() from public, anon, authenticated;
grant execute on function private.map_geometry_segments_intersect(
  double precision, double precision, double precision, double precision,
  double precision, double precision, double precision, double precision
) to authenticated;
grant execute on function private.normalize_map_entity_geometry(public.entity_type, jsonb) to authenticated;
grant execute on function private.map_entity_geometry_representative(jsonb) to authenticated;

create trigger map_entities_geometry_guard
before insert or update of entity_type, geometry, x, y on public.map_entities
for each row execute function private.enforce_map_entity_geometry();

alter table public.map_entities
  add constraint map_entities_geometry_kind_check
    check (geometry ->> 'kind' in ('point', 'polygon')),
  add constraint map_entities_character_point_geometry_check
    check (entity_type = 'location'::public.entity_type or geometry ->> 'kind' = 'point');

-- New editor projection: v5 remains available for legacy point-only clients.
create function public.admin_get_map_entity_editor_v6(
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
  entity_geometry jsonb;
begin
  editor := public.admin_get_map_entity_editor_v5(p_campaign_id, p_entity_id);

  select entity.geometry
  into entity_geometry
  from public.map_entities as entity
  where entity.id = p_entity_id
    and entity.campaign_id = p_campaign_id;

  return pg_catalog.jsonb_set(editor, '{record,geometry}', entity_geometry, true);
end;
$$;

revoke all on function public.admin_get_map_entity_editor_v6(uuid, text) from public, anon;
grant execute on function public.admin_get_map_entity_editor_v6(uuid, text) to authenticated;

create function public.admin_save_map_entity_v6(
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
  p_player_association_ids text[]
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

  normalized_geometry := private.normalize_map_entity_geometry(p_entity_type, p_geometry);
  select rep.x, rep.y
  into representative
  from private.map_entity_geometry_representative(normalized_geometry) as rep;

  -- Preserve the lock order hardened by MAP-058: advisory entity lock before any
  -- row lock, including the geometry pre-update used for polygon -> point changes.
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

    if existing.geometry is distinct from normalized_geometry then
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
  elsif p_expected_relations_revision is not null then
    raise exception using errcode = '23514', message = 'new entity cannot carry an existing relation revision';
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

  -- New rows are created by v5 through its legacy point-compatible path and then
  -- promoted to the requested canonical geometry in this same transaction.
  if p_expected_updated_at is null and (
    select entity.geometry is distinct from normalized_geometry
    from public.map_entities as entity
    where entity.id = p_id and entity.campaign_id = p_campaign_id
  ) then
    update public.map_entities as entity
    set geometry = normalized_geometry
    where entity.id = p_id
      and entity.campaign_id = p_campaign_id;
  end if;

  return public.admin_get_map_entity_editor_v6(p_campaign_id, p_id);
end;
$$;

revoke all on function public.admin_save_map_entity_v6(
  uuid, text, timestamptz, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, jsonb, text,
  public.publication_status, text[], jsonb, text[]
) from public, anon;
grant execute on function public.admin_save_map_entity_v6(
  uuid, text, timestamptz, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, jsonb, text,
  public.publication_status, text[], jsonb, text[]
) to authenticated;

-- Modo Máster needs the same geometry contract, but only after authorization and
-- campaign scoping performed by v4. Public snapshot generation never calls this RPC.
create function public.admin_get_master_catalog_v5(p_campaign_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
  entities jsonb;
begin
  result := public.admin_get_master_catalog_v4(p_campaign_id);

  select coalesce(pg_catalog.jsonb_agg(
    source_entity.value || pg_catalog.jsonb_build_object('geometry', entity.geometry)
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

revoke all on function public.admin_get_master_catalog_v5(uuid) from public, anon;
grant execute on function public.admin_get_master_catalog_v5(uuid) to authenticated;

comment on column public.map_entities.geometry is
  'MAP-060 canonical point/polygon geometry. x/y are a derived backwards-compatible representative point.';
comment on function public.admin_save_map_entity_v6(
  uuid, text, timestamptz, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, jsonb, text,
  public.publication_status, text[], jsonb, text[]
) is
  'MAP-060 campaign-scoped atomic editor save using canonical persistent geometry.';
comment on function public.admin_get_master_catalog_v5(uuid) is
  'MAP-060 authorized campaign-scoped Master catalog including canonical geometry. Never used by public snapshot generation.';

commit;
