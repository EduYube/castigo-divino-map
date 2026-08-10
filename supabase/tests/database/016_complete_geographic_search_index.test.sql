begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

select is(
  (
    select count(*)
    from public.geographic_names
    where publication_status = 'published'::public.publication_status
  ),
  213::bigint,
  'MAP-039 publishes the complete audited 213-name raster inventory'
);

select is(
  (
    select string_agg(name, '|' order by id)
    from public.geographic_names
    where id in (
      'geo-waterdeep',
      'geo-the-dalelands',
      'geo-thunder-peaks',
      'geo-the-frozen-forest',
      'geo-sea-of-fallen-stars',
      'geo-omans-isle',
      'geo-high-road',
      'geo-boareskyr-bridge'
    )
  ),
  'Boareskyr Bridge|High Road|Omans Isle|Sea of Fallen Stars|The Dalelands|The Frozen Forest|Thunder Peaks|Waterdeep',
  'representative settlement, region, mountain, forest, water, island, route and landmark identities exist'
);

select ok(
  (
    select x = 3180
      and y = 1009
      and recommended_zoom = 0.50
      and entity_id is null
    from public.geographic_names
    where id = 'geo-the-dalelands'
  ),
  'The Dalelands keeps its measured region coordinate, area zoom and search-only identity'
);

select ok(
  (
    select x = 3100
      and y = 859
      and recommended_zoom = 0.50
      and entity_id is null
    from public.geographic_names
    where id = 'geo-thunder-peaks'
  ),
  'Thunder Peaks keeps its measured mountain coordinate and area zoom'
);

select ok(
  (
    select x = 1090
      and y = 899
      and recommended_zoom = 0.50
      and entity_id is null
    from public.geographic_names
    where id = 'geo-omans-isle'
  ),
  'Omans Isle uses the exact raster spelling and island coordinate'
);

select ok(
  (
    select name = 'Star Mounts'
      and slug = 'star-mountains'
      and x = 2000
      and y = 1746
      and recommended_zoom = 0.50
    from public.geographic_names
    where id = 'geo-star-mountains'
  ),
  'MAP-032 Star Mountains identity is preserved while the canonical raster label is Star Mounts'
);

select is(
  (
    select value
    from public.geographic_name_aliases
    where id = 'geo-alias-star-mountains-legacy'
  ),
  'Star Mountains',
  'the former MAP-032 Star Mountains display remains a searchable alias'
);

select is(
  (
    select count(*)
    from (
      select slug
      from public.geographic_names
      where publication_status = 'published'::public.publication_status
      group by slug
      having count(*) > 1
    ) duplicates
  ),
  0::bigint,
  'published geographic slugs contain no duplicates'
);

set local role anon;

select is(
  (
    select count(*)
    from public.geographic_names
    where id in (
      'geo-waterdeep',
      'geo-the-dalelands',
      'geo-thunder-peaks',
      'geo-the-shining-plains',
      'geo-the-high-ice',
      'geo-omans-isle'
    )
  ),
  6::bigint,
  'anon can read the MAP-039 representative geographic sample through existing RLS'
);

select is(
  (
    select count(*)
    from public.geographic_name_aliases
    where id in (
      'geo-alias-evermoors',
      'geo-alias-fields-of-the-dead',
      'geo-alias-high-forest',
      'geo-alias-high-moor',
      'geo-alias-star-mountains-legacy',
      'geo-alias-waterdeep-city-of-splendors'
    )
  ),
  6::bigint,
  'anon can read all required published aliases through existing RLS'
);

select * from finish();
rollback;
