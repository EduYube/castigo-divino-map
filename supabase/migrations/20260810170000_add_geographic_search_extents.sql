set lock_timeout = '5s';

alter table public.geographic_names
  add column if not exists search_min_x double precision,
  add column if not exists search_max_x double precision,
  add column if not exists search_min_y double precision,
  add column if not exists search_max_y double precision;

comment on column public.geographic_names.search_min_x is
  'MAP-041 representative search focus minimum X in the 3600x2329 CRS.Simple raster; nullable and not an official boundary.';
comment on column public.geographic_names.search_max_x is
  'MAP-041 representative search focus maximum X in the 3600x2329 CRS.Simple raster; nullable and not an official boundary.';
comment on column public.geographic_names.search_min_y is
  'MAP-041 representative search focus minimum Y in the 3600x2329 CRS.Simple raster; nullable and not an official boundary.';
comment on column public.geographic_names.search_max_y is
  'MAP-041 representative search focus maximum Y in the 3600x2329 CRS.Simple raster; nullable and not an official boundary.';

do $$
declare
  extent_column_name text;
  actual_udt text;
  actual_nullable text;
begin
  foreach extent_column_name in array array['search_min_x','search_max_x','search_min_y','search_max_y'] loop
    select c.udt_name, c.is_nullable
      into actual_udt, actual_nullable
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'geographic_names'
      and c.column_name = extent_column_name;

    if actual_udt is distinct from 'float8' or actual_nullable is distinct from 'YES' then
      raise exception 'MAP-041 schema conflict for geographic_names.%: expected nullable float8, got udt=% nullable=%',
        extent_column_name, actual_udt, actual_nullable;
    end if;
  end loop;
end
$$;

do $$
declare
  existing_constraint oid;
  existing_comment text;
begin
  select con.oid, obj_description(con.oid, 'pg_constraint')
    into existing_constraint, existing_comment
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
    and rel.relname = 'geographic_names'
    and con.conname = 'geographic_names_search_extent_check';

  if existing_constraint is null then
    alter table public.geographic_names
      add constraint geographic_names_search_extent_check
      check (
        (
          search_min_x is null and search_max_x is null and
          search_min_y is null and search_max_y is null
        )
        or
        (
          search_min_x is not null and search_max_x is not null and
          search_min_y is not null and search_max_y is not null and
          search_min_x >= 0::double precision and search_max_x <= 3600::double precision and
          search_min_y >= 0::double precision and search_max_y <= 2329::double precision and
          search_min_x < search_max_x and search_min_y < search_max_y and
          search_min_x <> all (array['NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision]) and
          search_max_x <> all (array['NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision]) and
          search_min_y <> all (array['NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision]) and
          search_max_y <> all (array['NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision]) and
          x between search_min_x and search_max_x and
          y between search_min_y and search_max_y
        )
      );

    comment on constraint geographic_names_search_extent_check on public.geographic_names is
      'MAP-041-v1: all-or-none finite representative bounds inside 3600x2329 containing the canonical coordinate.';
  elsif existing_comment is distinct from
    'MAP-041-v1: all-or-none finite representative bounds inside 3600x2329 containing the canonical coordinate.' then
    raise exception 'MAP-041 semantic conflict: geographic_names_search_extent_check already exists without the MAP-041-v1 contract marker';
  end if;
end
$$;

do $$
declare
  expected record;
  actual record;
begin
  for expected in
    select * from (values
      ('geo-anauroch', 'Anauroch', 2700::double precision, 1329::double precision, 0.5::double precision, 2450::double precision, 3100::double precision, 1050::double precision, 1700::double precision),
      ('geo-cormyr', 'Cormyr', 2870, 769, 0.5, 2700, 3290, 600, 950),
      ('geo-evermoors', 'The Evermoors', 1890, 1921, 0.5, 1720, 2030, 1810, 2020),
      ('geo-forest-of-tethir', 'Forest of Tethir', 2180, 139, 0.5, 1880, 2580, 0, 300),
      ('geo-high-forest', 'The High Forest', 2098, 1809, 0.5, 1700, 2250, 1500, 2010),
      ('geo-high-moor', 'The High Moor', 2010, 1279, 0.5, 1750, 2300, 1100, 1450),
      ('geo-icewind-dale', 'Icewind Dale', 1250, 2209, 0.5, 1120, 1450, 2010, 2290),
      ('geo-moonshae-isles', 'Moonshae Isles', 1110, 1099, 0.5, 850, 1390, 570, 1250),
      ('geo-sea-of-swords', 'Sea of Swords', 1570, 889, 0.5, 1370, 1740, 680, 1180),
      ('geo-sword-coast', 'Sword Coast', 1450, 1049, 0.5, 1380, 1710, 750, 1500),
      ('geo-the-dalelands', 'The Dalelands', 3180, 1009, 0.5, 3050, 3430, 850, 1200),
      ('geo-the-high-ice', 'The High Ice', 2760, 2054, 0.5, 2350, 3130, 1650, 2290),
      ('geo-the-shining-plains', 'The Shining Plains', 2860, 219, 0.5, 2700, 3270, 70, 380)
    ) as extent(id, name, x, y, recommended_zoom, min_x, max_x, min_y, max_y)
  loop
    select g.id, g.name, g.x, g.y, g.recommended_zoom, g.publication_status,
           g.search_min_x, g.search_max_x, g.search_min_y, g.search_max_y
      into actual
    from public.geographic_names g
    where g.id = expected.id;

    if not found then
      raise exception 'MAP-041 semantic conflict: required MAP-039 identity % is missing', expected.id;
    end if;

    if actual.name is distinct from expected.name or
       actual.x is distinct from expected.x or actual.y is distinct from expected.y or
       actual.recommended_zoom is distinct from expected.recommended_zoom or
       actual.publication_status is distinct from 'published'::public.publication_status then
      raise exception 'MAP-041 semantic conflict: identity % no longer matches reviewed MAP-039 canonical data', expected.id;
    end if;

    if not (
      (actual.search_min_x is null and actual.search_max_x is null and actual.search_min_y is null and actual.search_max_y is null)
      or
      (actual.search_min_x is not distinct from expected.min_x and
       actual.search_max_x is not distinct from expected.max_x and
       actual.search_min_y is not distinct from expected.min_y and
       actual.search_max_y is not distinct from expected.max_y)
    ) then
      raise exception 'MAP-041 semantic conflict: identity % already has different search bounds', expected.id;
    end if;

    update public.geographic_names
    set search_min_x = expected.min_x,
        search_max_x = expected.max_x,
        search_min_y = expected.min_y,
        search_max_y = expected.max_y,
        updated_at = timezone('utc'::text, now())
    where id = expected.id;
  end loop;
end
$$;
