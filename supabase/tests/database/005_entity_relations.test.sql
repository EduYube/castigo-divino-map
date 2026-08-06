begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create function pg_temp.sqlstate_for(statement text)
returns text
language plpgsql
as $$
begin
  execute statement;
  return null;
exception
  when others then
    return sqlstate;
end;
$$;

select plan(28);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*) from public.entity_player_dispositions),
  (
    select count(*)::bigint
    from public.map_entities
    cross join public.players
  ),
  'the entity-player disposition matrix is complete'
);

select is(
  (
    select array_agg(disposition::text order by player_id)
    from public.entity_player_dispositions
    where entity_id = 'entity-aster-guide'
  ),
  array['ally', 'neutral']::text[],
  'a character can be ally to one player and neutral to another'
);

select is(
  (
    select array_agg(disposition::text order by player_id)
    from public.entity_player_dispositions
    where entity_id = 'entity-bramble-fort'
  ),
  array['enemy', 'ally']::text[],
  'a location can have independent dispositions for both players'
);

select lives_ok(
  $$insert into public.map_entities (
    id, slug, entity_type, name, x, y, category_id
  ) values (
    'entity-matrix-location',
    'matrix-location',
    'location',
    'Matrix Location',
    100,
    100,
    'category-places'
  )$$,
  'a location can be created without a global disposition'
);

select is(
  (
    select count(*)
    from public.entity_player_dispositions
    where entity_id = 'entity-matrix-location'
      and disposition = 'neutral'
  ),
  2::bigint,
  'a new entity receives an explicit neutral row for every player'
);

select lives_ok(
  $$insert into public.players (
    id, slug, display_name
  ) values (
    'player-demo-three',
    'demo-three',
    'Demo Player Three'
  )$$,
  'the generic model can add another player without a schema migration'
);

select is(
  (
    select count(*)
    from public.entity_player_dispositions
    where player_id = 'player-demo-three'
      and disposition = 'neutral'
  ),
  (select count(*) from public.map_entities),
  'a new player receives an explicit neutral row for every entity'
);

reset role;
set local role anon;

select is(
  (
    select visibility
    from public.map_entities
    where id = 'entity-bramble-fort'
  ),
  'search_only'::public.map_visibility,
  'search-only entities remain publicly readable despite having no permanent pin'
);

reset role;
set local role authenticated;

select throws_ok(
  $$insert into public.geographic_names (
    id, slug, name, x, y, entity_id
  ) values (
    'geo-invalid-character-link',
    'invalid-character-link',
    'Invalid Character Link',
    10,
    10,
    'entity-aster-guide'
  )$$,
  '23514',
  'a geographic name may only link to a location entity',
  'geographic names cannot use entity_id as a generic containment relation'
);

select lives_ok(
  $$insert into public.geographic_name_aliases (
    id, geographic_name_id, language, value
  ) values (
    'geo-alias-silver-path',
    'geo-silver-crossing',
    'en',
    '  Silver Path  '
  )$$,
  'a draft geographic alias can be added through the normalized relation'
);

select is(
  (
    select normalized_value
    from public.geographic_name_aliases
    where id = 'geo-alias-silver-path'
  ),
  'silver path',
  'geographic aliases use the shared search normalization'
);

select throws_ok(
  $$insert into public.geographic_name_aliases (
    id, geographic_name_id, language, value, publication_status
  ) values (
    'geo-alias-main-collision',
    'geo-silver-crossing',
    'en',
    'Silver Crossing',
    'published'
  )$$,
  '23505',
  'published geographic names and aliases must be unambiguous',
  'published geographic aliases cannot collide with a main geographic name'
);

select throws_ok(
  $$insert into public.public_note_tags (
    id, note_id, tag_id, publication_status
  ) values (
    'note-tag-invalid-draft',
    'note-aster-arrival',
    'draft-tag',
    'published'
  )$$,
  '23514',
  'a published note tag requires published endpoints',
  'published note tags require both note and tag to be public'
);

select lives_ok(
  $$insert into public.character_location_events (
    id,
    character_id,
    event_type,
    x,
    y,
    location_label,
    observed_at
  ) values (
    'location-event-aster-road',
    'entity-aster-guide',
    'sighting',
    1700,
    1000,
    'On an unnamed road',
    '2026-01-10T10:00:00Z'
  )$$,
  'a sighting can be recorded with coordinates outside a named location'
);

select lives_ok(
  $$update public.character_location_events
    set publication_status = 'published'
    where id = 'location-event-aster-road'$$,
  'a coordinate-only sighting can become the public latest known position'
);

select throws_ok(
  $$update public.character_location_events
    set x = 1701
    where id = 'location-event-aster-road'$$,
  '23514',
  'published relation identity is immutable',
  'published location evidence cannot silently move to another point'
);

select lives_ok(
  $$insert into public.character_location_events (
    id,
    character_id,
    event_type,
    x,
    y,
    location_label,
    observed_at,
    related_sighting_id,
    publication_status
  ) values (
    'location-event-aster-road-departure',
    'entity-aster-guide',
    'departure',
    1700,
    1000,
    'Left the unnamed road',
    '2026-01-11T10:00:00Z',
    'location-event-aster-road',
    'published'
  )$$,
  'a departure can extend a prior sighting for the same character'
);

select throws_ok(
  $$insert into public.character_location_events (
    id,
    character_id,
    event_type,
    x,
    y,
    observed_at,
    related_sighting_id
  ) values (
    'location-event-aster-before-sighting',
    'entity-aster-guide',
    'departure',
    1700,
    1000,
    '2026-01-09T10:00:00Z',
    'location-event-aster-road'
  )$$,
  '23514',
  'a departure cannot precede its related sighting',
  'event chronology rejects a departure before its sighting'
);

select throws_ok(
  $$insert into public.character_location_events (
    id,
    character_id,
    event_type,
    x,
    y,
    observed_at,
    related_sighting_id
  ) values (
    'location-event-echo-related-to-aster',
    'entity-echo-wanderer',
    'departure',
    1700,
    1000,
    '2026-01-12T10:00:00Z',
    'location-event-aster-road'
  )$$,
  '23514',
  'a related sighting must belong to the same character',
  'one character cannot inherit another character sighting'
);

select is(
  (
    select count(*)
    from public.character_location_events
    where character_id = 'entity-aster-guide'
      and publication_status = 'published'
  ),
  4::bigint,
  'multiple published events preserve an ordered public trail instead of one mutable position'
);

select lives_ok(
  $$insert into public.map_entities (
    id, slug, entity_type, visibility, name, x, y, category_id
  ) values
    (
      'entity-request-character-target',
      'request-character-target',
      'character',
      'pin',
      'Request Character Target',
      2000,
      1300,
      'category-people'
    ),
    (
      'entity-request-search-target',
      'request-search-target',
      'location',
      'search_only',
      'Request Search Target',
      2000,
      1300,
      'category-places'
    ),
    (
      'entity-request-pin-target',
      'request-pin-target',
      'location',
      'pin',
      'Request Pin Target',
      2000,
      1300,
      'category-places'
    )$$,
  'request conversion fixtures are valid draft entities'
);

select lives_ok(
  $$update public.public_requests
    set request_status = 'accepted'
    where id = '10000000-0000-4000-8000-000000000001'$$,
  'a pending request can enter editorial review'
);

select throws_ok(
  $$update public.public_requests
    set
      request_status = 'converted',
      converted_entity_id = 'entity-request-character-target'
    where id = '10000000-0000-4000-8000-000000000001'$$,
  '23514',
  'a converted request requires a matching draft pin entity',
  'request conversion rejects a target with a different entity type'
);

select throws_ok(
  $$update public.public_requests
    set
      request_status = 'converted',
      converted_entity_id = 'entity-request-search-target'
    where id = '10000000-0000-4000-8000-000000000001'$$,
  '23514',
  'a converted request requires a matching draft pin entity',
  'request conversion rejects search-only targets'
);

select lives_ok(
  $$update public.public_requests
    set
      request_status = 'converted',
      converted_entity_id = 'entity-request-pin-target'
    where id = '10000000-0000-4000-8000-000000000001'$$,
  'a matching draft pin entity can complete a request conversion'
);

select is(
  (
    select request_status
    from public.public_requests
    where id = '10000000-0000-4000-8000-000000000001'
  ),
  'converted'::public.request_status,
  'the valid conversion persists the converted status'
);

select throws_ok(
  $$update public.public_requests
    set converted_entity_id = 'entity-request-search-target'
    where id = '10000000-0000-4000-8000-000000000001'$$,
  '23514',
  'a converted request target is immutable',
  'a converted request cannot be retargeted'
);

reset role;

insert into public.public_requests (
  id,
  sender_name,
  proposed_name,
  entity_type,
  x,
  y,
  description,
  reason
)
values (
  '10000000-0000-4000-8000-000000000098',
  'Second Visitor',
  'Second Beacon',
  'location',
  2000,
  1300,
  'A second deterministic request.',
  'Exercises unique conversion ownership.'
);

set local role authenticated;

update public.public_requests
set request_status = 'accepted'
where id = '10000000-0000-4000-8000-000000000098';

select is(
  pg_temp.sqlstate_for(
    $$update public.public_requests
      set
        request_status = 'converted',
        converted_entity_id = 'entity-request-pin-target'
      where id = '10000000-0000-4000-8000-000000000098'$$
  ),
  '23505',
  'one entity cannot be the conversion target of two public requests'
);

select * from finish();
rollback;
