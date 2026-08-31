begin;

-- MAP-060 follow-up hardening: PostgreSQL casts a missing JSON coordinate to
-- NULL without raising. Reject that case explicitly so malformed geometry is
-- reported through the same 23514 contract as every other structural error.
create or replace function private.normalize_map_entity_geometry(
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

    if x_value is null or y_value is null then
      raise exception using errcode = '23514', message = 'point geometry coordinates must be numeric';
    end if;

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

    if x_value is null or y_value is null then
      raise exception using errcode = '23514', message = 'polygon vertex coordinates must be numeric';
    end if;

    if x_value not between 0 and 3600
       or y_value not between 0 and 2329
       or x_value in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
       or y_value in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision) then
      raise exception using errcode = '23514', message = 'polygon geometry is outside map bounds';
    end if;

    xs := pg_catalog.array_append(xs, x_value);
    ys := pg_catalog.array_append(ys, y_value);
  end loop;

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

  if area_twice < 0 then
    for i in reverse vertex_count..1 loop
      reversed_xs := pg_catalog.array_append(reversed_xs, xs[i]);
      reversed_ys := pg_catalog.array_append(reversed_ys, ys[i]);
    end loop;
    xs := reversed_xs;
    ys := reversed_ys;
  end if;

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

commit;