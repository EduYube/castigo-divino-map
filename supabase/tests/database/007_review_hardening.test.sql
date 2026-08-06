begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

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
    'location-event-review-draft-sighting',
    'entity-aster-guide',
    'sighting',
    1800,
    1100,
    'Review draft sighting',
    '2026-02-10T10:00:00Z'
  )$$,
  'a draft sighting can be created for inverse validation tests'
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
    related_sighting_id
  ) values (
    'location-event-review-draft-departure',
    'entity-aster-guide',
    'departure',
    1800,
    1100,
    'Review draft departure',
    '2026-02-11T10:00:00Z',
    'location-event-review-draft-sighting'
  )$$,
  'a draft departure can reference the draft sighting'
);

select throws_ok(
  $$update public.character_location_events
    set character_id = 'entity-echo-wanderer'
    where id = 'location-event-review-draft-sighting'$$,
  '23514',
  'a related sighting must belong to the same character',
  'a referenced draft sighting cannot move to another character'
);

select throws_ok(
  $$update public.character_location_events
    set event_type = 'departure'
    where id = 'location-event-review-draft-sighting'$$,
  '23514',
  'a referenced sighting must remain a sighting',
  'a referenced draft sighting cannot become a departure'
);

select throws_ok(
  $$update public.character_location_events
    set observed_at = '2026-02-12T10:00:00Z'
    where id = 'location-event-review-draft-sighting'$$,
  '23514',
  'a departure cannot precede its related sighting',
  'a referenced draft sighting cannot move after its departure'
);

select lives_ok(
  $$update public.character_location_events
    set summary = 'Non-identity draft edit remains allowed.'
    where id = 'location-event-review-draft-sighting'$$,
  'non-identity draft fields remain editable'
);

select is(
  (
    select count(*)
    from public.map_entities as entity
    cross join public.players as player
    left join public.entity_player_dispositions as relation
      on relation.entity_id = entity.id
      and relation.player_id = player.id
    where relation.entity_id is null
  ),
  0::bigint,
  'the existing entity-player matrix is complete'
);

select lives_ok(
  $$insert into public.map_entities (
    id,
    slug,
    entity_type,
    name,
    x,
    y,
    category_id
  ) values (
    'entity-review-matrix-location',
    'review-matrix-location',
    'location',
    'Review Matrix Location',
    1900,
    1200,
    'category-places'
  )$$,
  'an entity can be inserted through the serialized matrix path'
);

select lives_ok(
  $$insert into public.players (
    id,
    slug,
    display_name
  ) values (
    'player-review-matrix',
    'review-matrix',
    'Review Matrix Player'
  )$$,
  'a player can be inserted through the serialized matrix path'
);

select is(
  (
    select disposition::text
    from public.entity_player_dispositions
    where entity_id = 'entity-review-matrix-location'
      and player_id = 'player-review-matrix'
  ),
  'neutral',
  'the serialized insertion paths create their intersection row'
);

select * from finish();
rollback;
