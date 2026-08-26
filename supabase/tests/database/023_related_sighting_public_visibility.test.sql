begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

insert into public.categories (
  campaign_id, id, slug, name, description, publication_status
) values (
  '00000000-0000-4000-8000-000000000053',
  'category-map053-sighting-visibility',
  'map053-sighting-visibility',
  'MAP053 sighting visibility',
  'Security regression fixture',
  'published'
);

insert into public.map_entities (
  campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
  x, y, category_id, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map053-visibility-character', 'map053-visibility-character',
  'character', 'pin', 'public', 'MAP053 visibility character', '', '',
  701, 701, 'category-map053-sighting-visibility', 'published'
),
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map053-visibility-public-location', 'map053-visibility-public-location',
  'location', 'pin', 'public', 'MAP053 public location', '', '',
  702, 702, 'category-map053-sighting-visibility', 'published'
),
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map053-visibility-master-location', 'map053-visibility-master-location',
  'location', 'pin', 'master', 'MAP053 MASTER RELATED SIGHTING CANARY', '', '',
  703, 703, 'category-map053-sighting-visibility', 'published'
);

insert into public.character_location_events (
  campaign_id, id, character_id, event_type, location_entity_id,
  location_label, summary, language, observed_at, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'location-event-map053-hidden-sighting',
  'entity-map053-visibility-character',
  'sighting',
  'entity-map053-visibility-master-location',
  'Hidden sighting endpoint',
  'Must stay outside the public projection',
  'en',
  '2026-08-20T10:00:00Z',
  'published'
),
(
  '00000000-0000-4000-8000-000000000053',
  'location-event-map053-public-sighting',
  'entity-map053-visibility-character',
  'sighting',
  'entity-map053-visibility-public-location',
  'Public sighting endpoint',
  'Public control sighting',
  'en',
  '2026-08-20T11:00:00Z',
  'published'
);

insert into public.character_location_events (
  campaign_id, id, character_id, event_type, location_entity_id,
  location_label, summary, language, observed_at, related_sighting_id, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'location-event-map053-hidden-dependent-departure',
  'entity-map053-visibility-character',
  'departure',
  'entity-map053-visibility-public-location',
  'Public departure endpoint',
  'Must be hidden because its related sighting is Master-only',
  'en',
  '2026-08-20T12:00:00Z',
  'location-event-map053-hidden-sighting',
  'published'
),
(
  '00000000-0000-4000-8000-000000000053',
  'location-event-map053-public-dependent-departure',
  'entity-map053-visibility-character',
  'departure',
  'entity-map053-visibility-public-location',
  'Public departure endpoint',
  'Public control departure',
  'en',
  '2026-08-20T13:00:00Z',
  'location-event-map053-public-sighting',
  'published'
);

select is(
  (select count(*) from public.character_location_events
   where id = 'location-event-map053-hidden-sighting'),
  1::bigint,
  'admin can inspect the Master-only related sighting'
);
select is(
  (select count(*) from public.character_location_events
   where id = 'location-event-map053-hidden-dependent-departure'),
  1::bigint,
  'admin can inspect the departure that depends on the Master-only sighting'
);

reset role;
set local role anon;

select is(
  (select count(*) from public.character_location_events
   where id = 'location-event-map053-hidden-sighting'),
  0::bigint,
  'anon cannot read the sighting whose endpoint is Master-only'
);
select is(
  (select count(*) from public.character_location_events
   where id = 'location-event-map053-hidden-dependent-departure'),
  0::bigint,
  'anon cannot infer a hidden sighting through related_sighting_id'
);
select is(
  (select count(*) from public.character_location_events
   where id = 'location-event-map053-public-sighting'),
  1::bigint,
  'anon can still read a fully public sighting'
);
select is(
  (select count(*) from public.character_location_events
   where id = 'location-event-map053-public-dependent-departure'),
  1::bigint,
  'anon can still read a departure whose related sighting is public'
);
select is(
  private.is_public_related_sighting(
    'location-event-map053-hidden-sighting',
    '00000000-0000-4000-8000-000000000053',
    'entity-map053-visibility-character'
  ),
  false,
  'the helper does not become an oracle for a hidden sighting'
);
select is(
  private.is_public_related_sighting(
    'location-event-map053-public-sighting',
    '00000000-0000-4000-8000-000000000053',
    'entity-map053-visibility-character'
  ),
  true,
  'the helper recognizes a sighting already inside the public projection'
);

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select is((select private.is_admin()), false, 'authenticated reader fixture is not an admin');
select is(
  (select count(*) from public.character_location_events
   where id = 'location-event-map053-hidden-sighting'),
  0::bigint,
  'authenticated non-admin cannot read the hidden related sighting'
);
select is(
  (select count(*) from public.character_location_events
   where id = 'location-event-map053-hidden-dependent-departure'),
  0::bigint,
  'authenticated non-admin cannot infer the hidden sighting through its departure'
);

select * from finish();
rollback;
