begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'geographic_names'
      and column_name in ('search_min_x', 'search_max_x', 'search_min_y', 'search_max_y')
  ),
  4::bigint,
  'MAP-041 adds exactly four geographic search bound columns'
);

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'geographic_names'
      and column_name in ('search_min_x', 'search_max_x', 'search_min_y', 'search_max_y')
      and udt_name = 'float8'
      and is_nullable = 'YES'
  ),
  4::bigint,
  'all MAP-041 bounds are nullable double precision columns'
);

select ok(
  exists(
    select 1
    from pg_constraint
    where conrelid = 'public.geographic_names'::regclass
      and conname = 'geographic_names_search_extent_check'
      and obj_description(oid, 'pg_constraint') = 'MAP-041-v1: all-or-none finite representative bounds inside 3600x2329 containing the canonical coordinate.'
  ),
  'the fail-closed MAP-041 bounds constraint is version-marked'
);

select is(
  (
    select count(*)
    from public.geographic_names
    where search_min_x is not null
      and publication_status = 'published'::public.publication_status
  ),
  13::bigint,
  'MAP-041 publishes exactly thirteen conservative representative extents'
);

select is(
  (
    select count(*)
    from public.geographic_names
    where num_nulls(search_min_x, search_max_x, search_min_y, search_max_y) not in (0, 4)
  ),
  0::bigint,
  'geographic search bounds are always all-or-none'
);

select is(
  (
    select count(*)
    from public.geographic_names
    where search_min_x is not null
      and not (
        search_min_x >= 0 and search_max_x <= 3600 and
        search_min_y >= 0 and search_max_y <= 2329 and
        search_min_x < search_max_x and search_min_y < search_max_y and
        x between search_min_x and search_max_x and
        y between search_min_y and search_max_y
      )
  ),
  0::bigint,
  'every published extent is non-degenerate, in-raster and contains its canonical point'
);

select ok(
  (
    select search_min_x = 1380 and search_max_x = 1710 and
           search_min_y = 750 and search_max_y = 1500
    from public.geographic_names
    where id = 'geo-sword-coast'
  ),
  'Sword Coast exposes the reviewed representative search extent'
);

select ok(
  (
    select search_min_x = 2700 and search_max_x = 3290 and
           search_min_y = 600 and search_max_y = 950
    from public.geographic_names
    where id = 'geo-cormyr'
  ),
  'Cormyr exposes the reviewed representative search extent'
);

select ok(
  (
    select search_min_x = 1880 and search_max_x = 2580 and
           search_min_y = 0 and search_max_y = 300
    from public.geographic_names
    where id = 'geo-forest-of-tethir'
  ),
  'Forest of Tethir exposes its raster-clipped representative search extent'
);

select ok(
  (
    select search_min_x = 2350 and search_max_x = 3130 and
           search_min_y = 1650 and search_max_y = 2290
    from public.geographic_names
    where id = 'geo-the-high-ice'
  ),
  'The High Ice exposes the reviewed representative search extent'
);

select ok(
  (
    select search_min_x is null and search_max_x is null and
           search_min_y is null and search_max_y is null and
           x = 1626 and y = 1465 and recommended_zoom = 0.75
    from public.geographic_names
    where id = 'geo-waterdeep'
  ),
  'Waterdeep remains a point target with its MAP-039 coordinate and zoom'
);

select is(
  (
    select count(*)
    from public.geographic_name_aliases
    where language = 'es'
      and publication_status = 'published'::public.publication_status
  ),
  8::bigint,
  'MAP-040 Spanish aliases remain intact after MAP-041'
);

select ok(
  (
    select g.search_min_x = 1380 and g.search_max_x = 1710 and
           g.search_min_y = 750 and g.search_max_y = 1500
    from public.geographic_name_aliases a
    join public.geographic_names g on g.id = a.geographic_name_id
    where a.id = 'geo-alias-sword-coast-es'
      and a.value = 'Costa de la Espada'
  ),
  'Costa de la Espada resolves to the same canonical Sword Coast extent'
);

select * from finish();
rollback;
