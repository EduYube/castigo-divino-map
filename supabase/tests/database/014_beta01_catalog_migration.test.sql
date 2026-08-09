begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

select is(
  (select count(*) from public.categories where id in ('category-settlement', 'category-landmark')),
  2::bigint,
  'MAP-028 persists both Beta 0.1 categories with stable IDs'
);

select is(
  (
    select string_agg(id || ':' || slug, ',' order by id)
    from public.categories
    where id in ('category-settlement', 'category-landmark')
  ),
  'category-landmark:lugares-destacados,category-settlement:asentamientos',
  'MAP-028 preserves category slugs'
);

select is(
  (
    select string_agg(id, ',' order by id)
    from public.tags
    where id in ('coastal', 'demo-data', 'mountain-pass', 'trade-route')
  ),
  'coastal,demo-data,mountain-pass,trade-route',
  'MAP-028 preserves the Beta 0.1 tag identities without inventing taxonomy'
);

select is(
  (select count(*) from public.map_entities where id in ('place-demo-harbor', 'place-demo-pass')),
  2::bigint,
  'MAP-028 preserves both historical place IDs as persistent map entities'
);

select ok(
  (
    select entity_type = 'location'::public.entity_type
      and visibility = 'pin'::public.map_visibility
      and slug = 'puerto-de-demostracion'
      and name = 'Puerto de demostración'
      and x = 1080.5
      and y = 820
      and category_id = 'category-settlement'
      and publication_status = 'published'::public.publication_status
    from public.map_entities
    where id = 'place-demo-harbor'
  ),
  'the harbor keeps its URL identity, coordinates and classification'
);

select ok(
  (
    select entity_type = 'location'::public.entity_type
      and visibility = 'pin'::public.map_visibility
      and slug = 'paso-de-demostracion'
      and name = 'Paso de demostración'
      and x = 2240
      and y = 1240.25
      and category_id = 'category-landmark'
      and publication_status = 'published'::public.publication_status
    from public.map_entities
    where id = 'place-demo-pass'
  ),
  'the pass keeps its URL identity, coordinates and classification'
);

select is(
  (
    select string_agg(value, ',' order by id)
    from public.entity_aliases
    where id in (
      'alias-demo-harbor-puerto-ejemplo',
      'alias-demo-pass-desfiladero-ejemplo'
    )
  ),
  'Puerto de ejemplo,Desfiladero de ejemplo',
  'legacy search aliases are migrated deterministically'
);

select is(
  (
    select string_agg(entity_id || ':' || tag_id, ',' order by entity_id, tag_id)
    from public.entity_tags
    where id like 'entity-tag-demo-%'
  ),
  'place-demo-harbor:coastal,place-demo-harbor:demo-data,place-demo-harbor:trade-route,place-demo-pass:demo-data,place-demo-pass:mountain-pass,place-demo-pass:trade-route',
  'legacy entity tag filters keep the exact relationships'
);

select is(
  (select count(*) from public.public_notes where id in ('note-demo-harbor-overview', 'note-demo-pass-travel')),
  2::bigint,
  'both public Beta 0.1 notes keep their stable IDs'
);

select is(
  (
    select string_agg(note_id || ':' || tag_id, ',' order by note_id, tag_id)
    from public.public_note_tags
    where id like 'note-tag-demo-%'
  ),
  'note-demo-harbor-overview:coastal,note-demo-harbor-overview:demo-data,note-demo-pass-travel:demo-data,note-demo-pass-travel:mountain-pass,note-demo-pass-travel:trade-route',
  'note tags remain available for legacy filter semantics'
);

select is(
  (select count(*) from public.geographic_names where id like 'geo-demo-%'),
  0::bigint,
  'MAP-028 does not invent geographic names for Beta 0.1 content'
);

select is(
  (select count(*) from public.players where id like 'player-beta01-%'),
  0::bigint,
  'MAP-028 does not invent player perspectives or dispositions'
);

set local role anon;

select is(
  (select count(*) from public.map_entities where id in ('place-demo-harbor', 'place-demo-pass')),
  2::bigint,
  'anon sees both migrated places through existing published-only RLS'
);

select is(
  (select count(*) from public.public_notes where id in ('note-demo-harbor-overview', 'note-demo-pass-travel')),
  2::bigint,
  'anon sees both migrated notes through existing published-only RLS'
);

select * from finish();
rollback;
