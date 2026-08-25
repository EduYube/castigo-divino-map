-- Deterministic, fictitious data for local development and RLS tests only.
-- Never run this seed against production.

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-4000-8000-000000000001',
    'local-admin@example.invalid',
    '{}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'local-reader@example.invalid',
    '{"is_admin": true, "role": "admin"}'::jsonb
  );

insert into private.admin_users (user_id)
values ('00000000-0000-4000-8000-000000000001');

insert into public.players (
  id,
  slug,
  display_name,
  name_language,
  publication_status
)
values
  ('player-demo-one', 'demo-one', 'Demo Player One', 'en', 'published'),
  ('player-demo-two', 'demo-two', 'Demo Player Two', 'en', 'published');

insert into public.categories (id, slug, name, description, publication_status)
values
  (
    'category-people',
    'people',
    'People',
    'Fictitious characters used by local tests.',
    'published'
  ),
  (
    'category-places',
    'places',
    'Places',
    'Fictitious locations used by local tests.',
    'published'
  ),
  (
    'category-draft',
    'draft-category',
    'Draft category',
    'A category that is not public.',
    'draft'
  ),
  (
    'category-archive',
    'archived-category',
    'Archived category',
    'A category archived before publication.',
    'archived'
  );

insert into public.tags (id, name, description, publication_status)
values
  ('notable', 'Notable', 'A published fictitious tag.', 'published'),
  ('draft-tag', 'Draft tag', 'A tag that is not public.', 'draft'),
  ('archived-tag', 'Archived tag', 'A tag archived before publication.', 'archived');

insert into public.map_entities (
  id,
  slug,
  entity_type,
  visibility,
  name_language,
  name,
  summary,
  description,
  x,
  y,
  category_id,
  publication_status
)
values
  (
    'entity-aster-guide',
    'aster-guide',
    'character',
    'pin',
    'en',
    'Aster Guide',
    'A fictitious ally.',
    'Aster exists only to exercise the local database.',
    800,
    500,
    'category-people',
    'published'
  ),
  (
    'entity-bramble-fort',
    'bramble-fort',
    'location',
    'search_only',
    'en',
    'Bramble Fort',
    'A fictitious location.',
    'Bramble Fort exists only to exercise the local database.',
    1800,
    1200,
    'category-places',
    'published'
  ),
  (
    'entity-cinder-rival',
    'cinder-rival',
    'character',
    'pin',
    'en',
    'Cinder Rival',
    'A withdrawn fictitious enemy.',
    'This row is left in draft after a simulated withdrawal.',
    1200,
    700,
    'category-people',
    'published'
  ),
  (
    'entity-dawn-envoy',
    'dawn-envoy',
    'character',
    'pin',
    'en',
    'Dawn Envoy',
    'An archived fictitious neutral character.',
    'This row exercises the archived lifecycle.',
    1400,
    900,
    'category-people',
    'archived'
  ),
  (
    'entity-echo-wanderer',
    'echo-wanderer',
    'character',
    'search_only',
    'en',
    'Echo Wanderer',
    'A fictitious neutral draft.',
    'This row has never been published.',
    1600,
    1000,
    'category-people',
    'draft'
  );

update public.entity_player_dispositions as relation
set disposition = values_to_apply.disposition::public.player_disposition
from (
  values
    ('entity-aster-guide', 'player-demo-one', 'ally'),
    ('entity-aster-guide', 'player-demo-two', 'neutral'),
    ('entity-bramble-fort', 'player-demo-one', 'enemy'),
    ('entity-bramble-fort', 'player-demo-two', 'ally'),
    ('entity-cinder-rival', 'player-demo-one', 'enemy'),
    ('entity-cinder-rival', 'player-demo-two', 'neutral')
) as values_to_apply(entity_id, player_id, disposition)
where relation.entity_id = values_to_apply.entity_id
  and relation.player_id = values_to_apply.player_id;

insert into public.entity_aliases (
  id,
  entity_id,
  language,
  value,
  publication_status
)
values
  (
    'alias-aster-lantern',
    'entity-aster-guide',
    'en',
    'The Lantern Guide',
    'published'
  ),
  (
    'alias-cinder-ember',
    'entity-cinder-rival',
    'en',
    'The Ember Rival',
    'published'
  ),
  (
    'alias-echo-draft',
    'entity-echo-wanderer',
    'en',
    'The Quiet Wanderer',
    'draft'
  );

insert into public.entity_tags (id, entity_id, tag_id, publication_status)
values
  ('entity-tag-aster-notable', 'entity-aster-guide', 'notable', 'published'),
  ('entity-tag-cinder-notable', 'entity-cinder-rival', 'notable', 'published'),
  ('entity-tag-echo-draft', 'entity-echo-wanderer', 'draft-tag', 'draft');

insert into public.public_notes (
  id,
  slug,
  entity_id,
  title,
  body,
  sort_order,
  publication_status
)
values
  (
    'note-aster-arrival',
    'aster-arrival',
    'entity-aster-guide',
    'Arrival',
    'A fictitious public note.',
    0,
    'published'
  ),
  (
    'note-cinder-withdrawn',
    'cinder-withdrawn',
    'entity-cinder-rival',
    'Withdrawn note',
    'This note remains marked published but its entity is not public.',
    0,
    'published'
  ),
  (
    'note-echo-draft',
    'echo-draft',
    'entity-echo-wanderer',
    'Draft note',
    'A fictitious draft note.',
    0,
    'draft'
  );

insert into public.public_note_tags (id, note_id, tag_id, publication_status)
values
  ('note-tag-aster-notable', 'note-aster-arrival', 'notable', 'published'),
  ('note-tag-cinder-notable', 'note-cinder-withdrawn', 'notable', 'published'),
  ('note-tag-echo-draft', 'note-echo-draft', 'draft-tag', 'draft');

insert into public.geographic_names (
  id,
  slug,
  name,
  language,
  x,
  y,
  recommended_zoom,
  publication_status
)
values
  (
    'geo-silver-crossing',
    'silver-crossing',
    'Silver Crossing',
    'en',
    2200,
    1400,
    1,
    'published'
  ),
  (
    'geo-bramble-fort',
    'bramble-fort-name',
    'Bramble Fort Region',
    'en',
    1800,
    1200,
    1,
    'published'
  ),
  (
    'geo-echo-trail',
    'echo-trail',
    'Echo Trail',
    'en',
    1600,
    1000,
    0,
    'draft'
  );

insert into public.campaign_geographic_entity_links (
  campaign_id,
  geographic_name_id,
  entity_id
)
values (
  '00000000-0000-4000-8000-000000000053',
  'geo-bramble-fort',
  'entity-bramble-fort'
);

insert into public.geographic_name_aliases (
  id,
  geographic_name_id,
  language,
  value,
  publication_status
)
values
  (
    'geo-alias-silver-crossing',
    'geo-silver-crossing',
    'en',
    'The Crossing',
    'published'
  ),
  ('geo-alias-echo-trail', 'geo-echo-trail', 'en', 'Quiet Trail', 'draft');

-- Sightings are inserted before departures so related-sighting validation never
-- depends on visibility between rows of the same multi-row INSERT statement.
insert into public.character_location_events (
  id,
  character_id,
  event_type,
  location_entity_id,
  geographic_name_id,
  x,
  y,
  location_label,
  summary,
  language,
  observed_at,
  related_sighting_id,
  publication_status
)
values
  (
    'relation-aster-bramble',
    'entity-aster-guide',
    'sighting',
    'entity-bramble-fort',
    null,
    null,
    null,
    'At Bramble Fort',
    'Aster was publicly sighted at the fort.',
    'en',
    '2026-01-02T10:00:00Z',
    null,
    'published'
  ),
  (
    'relation-cinder-bramble',
    'entity-cinder-rival',
    'sighting',
    'entity-bramble-fort',
    null,
    null,
    null,
    'Withdrawn sighting',
    'This event becomes hidden when its character is withdrawn.',
    'en',
    '2026-01-02T11:00:00Z',
    null,
    'published'
  ),
  (
    'location-event-echo-road',
    'entity-echo-wanderer',
    'sighting',
    null,
    null,
    1650,
    1010,
    'On an unnamed road',
    'A draft coordinate-only event.',
    'en',
    null,
    null,
    'draft'
  );

insert into public.character_location_events (
  id,
  character_id,
  event_type,
  location_entity_id,
  location_label,
  summary,
  language,
  observed_at,
  related_sighting_id,
  publication_status
)
values (
  'location-event-aster-departure',
  'entity-aster-guide',
  'departure',
  'entity-bramble-fort',
  'Left Bramble Fort',
  'Aster was reported to have left the fort.',
  'en',
  '2026-01-03T08:00:00Z',
  'relation-aster-bramble',
  'published'
);

insert into public.public_requests (
  id,
  sender_name,
  proposed_name,
  entity_type,
  x,
  y,
  description,
  reason,
  request_status
)
values (
  '10000000-0000-4000-8000-000000000001',
  'Local Visitor',
  'Fictitious Beacon',
  'location',
  2000,
  1300,
  'A deterministic local request.',
  'Used to exercise moderation policies.',
  'pending'
);

-- Simulate previously published content being withdrawn. Its published children
-- deliberately remain published so RLS tests can prove that endpoints control visibility.
update public.map_entities
set publication_status = 'draft'
where id = 'entity-cinder-rival';

commit;
