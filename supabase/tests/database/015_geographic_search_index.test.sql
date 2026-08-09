begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

select is(
  (
    select count(*)
    from public.geographic_names
    where id in (
      'geo-baldurs-gate',
      'geo-daggerford',
      'geo-evermoors',
      'geo-fields-of-the-dead',
      'geo-forest-of-wyrms',
      'geo-high-forest',
      'geo-high-moor',
      'geo-luskan',
      'geo-mirabar',
      'geo-neverwinter',
      'geo-silverymoon',
      'geo-star-mountains',
      'geo-sword-mountains',
      'geo-trollbark-forest',
      'geo-waterdeep'
    )
      and publication_status = 'published'::public.publication_status
  ),
  15::bigint,
  'MAP-032 publishes the complete 15-name geographic baseline'
);

select ok(
  (
    select slug = 'waterdeep'
      and name = 'Waterdeep'
      and language = 'en'
      and x = 1626
      and y = 1465
      and recommended_zoom = 0.75
      and entity_id is null
      and publication_status = 'published'::public.publication_status
    from public.geographic_names
    where id = 'geo-waterdeep'
  ),
  'Waterdeep keeps the measured coordinate, recommended zoom and search-only identity'
);

select is(
  (
    select count(*)
    from public.geographic_names
    where id in (
      'geo-baldurs-gate',
      'geo-daggerford',
      'geo-luskan',
      'geo-mirabar',
      'geo-neverwinter',
      'geo-silverymoon',
      'geo-waterdeep'
    )
      and recommended_zoom = 0.75
  ),
  7::bigint,
  'the settlement sample uses the MAP-021 settlement zoom rule'
);

select is(
  (
    select count(*)
    from public.geographic_names
    where id in (
      'geo-evermoors',
      'geo-fields-of-the-dead',
      'geo-forest-of-wyrms',
      'geo-high-forest',
      'geo-high-moor',
      'geo-star-mountains',
      'geo-sword-mountains',
      'geo-trollbark-forest'
    )
      and recommended_zoom = 0.50
  ),
  8::bigint,
  'the regional sample uses the MAP-021 region zoom rule'
);

select is(
  (
    select string_agg(value, ',' order by id)
    from public.geographic_name_aliases
    where id in (
      'geo-alias-evermoors',
      'geo-alias-fields-of-the-dead',
      'geo-alias-high-forest',
      'geo-alias-high-moor',
      'geo-alias-waterdeep-city-of-splendors'
    )
  ),
  'Evermoors,Fields of the Dead,High Forest,High Moor,City of Splendors',
  'MAP-032 publishes the expected English aliases'
);

select is(
  (
    select geographic_name_id
    from public.geographic_name_aliases
    where id = 'geo-alias-waterdeep-city-of-splendors'
  ),
  'geo-waterdeep',
  'City of Splendors resolves to Waterdeep without creating a campaign entity'
);

select is(
  (
    select count(*)
    from public.geographic_names
    where id in (
      'geo-baldurs-gate',
      'geo-daggerford',
      'geo-evermoors',
      'geo-fields-of-the-dead',
      'geo-forest-of-wyrms',
      'geo-high-forest',
      'geo-high-moor',
      'geo-luskan',
      'geo-mirabar',
      'geo-neverwinter',
      'geo-silverymoon',
      'geo-star-mountains',
      'geo-sword-mountains',
      'geo-trollbark-forest',
      'geo-waterdeep'
    )
      and entity_id is not null
  ),
  0::bigint,
  'the MAP-032 geographic baseline remains separate from campaign pin entities'
);

set local role anon;

select is(
  (
    select count(*)
    from public.geographic_names
    where id in (
      'geo-baldurs-gate',
      'geo-daggerford',
      'geo-evermoors',
      'geo-fields-of-the-dead',
      'geo-forest-of-wyrms',
      'geo-high-forest',
      'geo-high-moor',
      'geo-luskan',
      'geo-mirabar',
      'geo-neverwinter',
      'geo-silverymoon',
      'geo-star-mountains',
      'geo-sword-mountains',
      'geo-trollbark-forest',
      'geo-waterdeep'
    )
  ),
  15::bigint,
  'anon can read all published MAP-032 geographic names through existing RLS'
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
      'geo-alias-waterdeep-city-of-splendors'
    )
  ),
  5::bigint,
  'anon can read all published MAP-032 geographic aliases through existing RLS'
);

select * from finish();
rollback;
