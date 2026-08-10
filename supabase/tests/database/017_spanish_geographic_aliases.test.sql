begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

select is(
  (
    select count(*)
    from public.geographic_name_aliases
    where language = 'es'
      and publication_status = 'published'::public.publication_status
  ),
  8::bigint,
  'MAP-040 publishes exactly the eight officially verified Spanish aliases'
);

select is(
  (
    select string_agg(id, '|' order by id)
    from public.geographic_name_aliases
    where language = 'es'
      and publication_status = 'published'::public.publication_status
  ),
  'geo-alias-baldurs-gate-es|geo-alias-candlekeep-es|geo-alias-icewind-dale-es|geo-alias-moonshae-isles-es|geo-alias-neverwinter-es|geo-alias-silverymoon-es|geo-alias-sword-coast-es|geo-alias-waterdeep-es',
  'Spanish aliases use deterministic identity-derived IDs'
);

select is(
  (
    select string_agg(geographic_name_id || '=' || value, '|' order by geographic_name_id)
    from public.geographic_name_aliases
    where language = 'es'
      and publication_status = 'published'::public.publication_status
  ),
  'geo-baldurs-gate=Puerta de Baldur|geo-candlekeep=Candelero|geo-icewind-dale=Valle del Viento Helado|geo-moonshae-isles=Islas Lunshaes|geo-neverwinter=Nuncainvierno|geo-silverymoon=Luna Plateada|geo-sword-coast=Costa de la Espada|geo-waterdeep=Aguas Profundas',
  'Spanish aliases point to the intended MAP-039 identities'
);

select is(
  (
    select count(*)
    from public.geographic_names
    where id in (
      'geo-baldurs-gate',
      'geo-candlekeep',
      'geo-icewind-dale',
      'geo-moonshae-isles',
      'geo-neverwinter',
      'geo-silverymoon',
      'geo-sword-coast',
      'geo-waterdeep'
    )
      and language = 'en'
      and publication_status = 'published'::public.publication_status
  ),
  8::bigint,
  'translated searches keep one canonical English geographic identity each'
);

select ok(
  (
    select name = 'Waterdeep'
      and language = 'en'
      and x = 1626
      and y = 1465
      and recommended_zoom = 0.75
      and entity_id is null
    from public.geographic_names
    where id = 'geo-waterdeep'
  ),
  'Aguas Profundas reuses Waterdeep coordinates, zoom and search-only identity'
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
      and language = 'en'
      and publication_status = 'published'::public.publication_status
  ),
  6::bigint,
  'all historical English geographic aliases remain intact'
);

select is(
  (
    select count(*)
    from (
      select normalized_value
      from public.geographic_name_aliases
      where publication_status = 'published'::public.publication_status
      group by normalized_value
      having count(*) > 1
    ) duplicate_aliases
  ),
  0::bigint,
  'published geographic aliases have no normalized search collisions'
);

select ok(
  (
    select pg_get_constraintdef(oid) like '%language = ANY%'
      and pg_get_constraintdef(oid) like '%en%'
      and pg_get_constraintdef(oid) like '%es%'
      and pg_get_constraintdef(oid) not like '%fr%'
    from pg_constraint
    where conrelid = 'public.geographic_name_aliases'::regclass
      and conname = 'geographic_name_aliases_language_check'
  ),
  'geographic alias language constraint admits en/es and no unrelated locale'
);

select ok(
  (
    select pg_get_constraintdef(oid) like '%language = ''en''%'
    from pg_constraint
    where conrelid = 'public.geographic_names'::regclass
      and conname = 'geographic_names_language_check'
  ),
  'canonical geographic names remain constrained to English'
);

set local role anon;

select is(
  (
    select count(*)
    from public.geographic_name_aliases
    where language = 'es'
      and publication_status = 'published'::public.publication_status
  ),
  8::bigint,
  'anon can read every verified Spanish alias through the existing RLS policy'
);

select * from finish();
rollback;
