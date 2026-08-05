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

insert into private.admin_users (user_id, created_at)
values ('00000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z');

insert into public.categories (
  id, slug, name, description, publication_status, published_at, archived_at, created_at, updated_at
)
values
  ('category-people', 'people', 'People', 'Fictitious characters used by local tests.', 'published', '2026-01-01T00:00:00Z', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('category-places', 'places', 'Places', 'Fictitious locations used by local tests.', 'published', '2026-01-01T00:00:00Z', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('category-draft', 'draft-category', 'Draft category', 'A category that is not public.', 'draft', null, null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('category-archive', 'archived-category', 'Archived category', 'A category archived before publication.', 'archived', null, '2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');

insert into public.tags (
  id, name, description, publication_status, published_at, archived_at, created_at, updated_at
)
values
  ('notable', 'Notable', 'A published fictitious tag.', 'published', '2026-01-01T00:00:00Z', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('draft-tag', 'Draft tag', 'A tag that is not public.', 'draft', null, null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('archived-tag', 'Archived tag', 'A tag archived before publication.', 'archived', null, '2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');

insert into public.map_entities (
  id, slug, entity_type, disposition, name, summary, description, x, y, category_id,
  publication_status, published_at, archived_at, created_at, updated_at
)
values
  ('entity-aster-guide', 'aster-guide', 'character', 'ally', 'Aster Guide', 'A fictitious ally.', 'Aster exists only to exercise the local database.', 800, 500, 'category-people', 'published', '2026-01-01T00:00:00Z', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('entity-bramble-fort', 'bramble-fort', 'location', 'unknown', 'Bramble Fort', 'A fictitious location.', 'Bramble Fort exists only to exercise the local database.', 1800, 1200, 'category-places', 'published', '2026-01-01T00:00:00Z', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('entity-cinder-rival', 'cinder-rival', 'character', 'enemy', 'Cinder Rival', 'A withdrawn fictitious enemy.', 'This row is left in draft after a simulated withdrawal.', 1200, 700, 'category-people', 'published', '2026-01-01T00:00:00Z', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('entity-dawn-envoy', 'dawn-envoy', 'character', 'neutral', 'Dawn Envoy', 'An archived fictitious neutral character.', 'This row exercises the archived lifecycle.', 1400, 900, 'category-people', 'archived', '2026-01-01T00:00:00Z', '2026-01-03T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-03T00:00:00Z'),
  ('entity-echo-wanderer', 'echo-wanderer', 'character', 'unknown', 'Echo Wanderer', 'A fictitious unknown draft.', 'This row has never been published.', 1600, 1000, 'category-people', 'draft', null, null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

insert into public.entity_aliases (
  id, entity_id, language, value, publication_status, published_at, archived_at, created_at, updated_at
)
values
  ('alias-aster-lantern', 'entity-aster-guide', 'en', 'The Lantern Guide', 'published', '2026-01-01T00:00:00Z', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('alias-cinder-ember', 'entity-cinder-rival', 'en', 'The Ember Rival', 'published', '2026-01-01T00:00:00Z', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('alias-echo-draft', 'entity-echo-wanderer', 'en', 'The Quiet Wanderer', 'draft', null, null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

insert into public.entity_tags (
  id, entity_id, tag_id, publication_status, published_at, archived_at, created_at, updated_at
)
values
  ('entity-tag-aster-notable', 'entity-aster-guide', 'notable', 'published', '2026-01-01T00:00:00Z', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('entity-tag-cinder-notable', 'entity-cinder-rival', 'notable', 'published', '2026-01-01T00:00:00Z', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('entity-tag-echo-draft', 'entity-echo-wanderer', 'draft-tag', 'draft', null, null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

insert into public.public_notes (
  id, slug, entity_id, title, body, sort_order, publication_status, published_at, archived_at, created_at, updated_at
)
values
  ('note-aster-arrival', 'aster-arrival', 'entity-aster-guide', 'Arrival', 'A fictitious public note.', 0, 'published', '2026-01-01T00:00:00Z', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('note-cinder-withdrawn', 'cinder-withdrawn', 'entity-cinder-rival', 'Withdrawn note', 'This note remains marked published but its entity is not public.', 0, 'published', '2026-01-01T00:00:00Z', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('note-echo-draft', 'echo-draft', 'entity-echo-wanderer', 'Draft note', 'A fictitious draft note.', 0, 'draft', null, null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

insert into public.character_locations (
  id, character_id, location_id, label, sort_order, publication_status, published_at, archived_at, created_at, updated_at
)
values
  ('relation-aster-bramble', 'entity-aster-guide', 'entity-bramble-fort', 'Often visits', 0, 'published', '2026-01-01T00:00:00Z', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('relation-cinder-bramble', 'entity-cinder-rival', 'entity-bramble-fort', 'Withdrawn relation', 0, 'published', '2026-01-01T00:00:00Z', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

insert into public.geographic_names (
  id, slug, name, aliases, language, x, y, recommended_zoom, entity_id,
  publication_status, published_at, archived_at, created_at, updated_at
)
values
  ('geo-silver-crossing', 'silver-crossing', 'Silver Crossing', array['The Crossing'], 'en', 2200, 1400, 1, null, 'published', '2026-01-01T00:00:00Z', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('geo-bramble-fort', 'bramble-fort-name', 'Bramble Fort Region', array[]::text[], 'en', 1800, 1200, 1, 'entity-bramble-fort', 'published', '2026-01-01T00:00:00Z', null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('geo-echo-trail', 'echo-trail', 'Echo Trail', array[]::text[], 'en', 1600, 1000, 0, 'entity-echo-wanderer', 'draft', null, null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

insert into public.public_requests (
  id, sender_name, proposed_name, entity_type, x, y, description, reason, request_status, created_at, updated_at
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
  'pending',
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z'
);

-- Simulate previously published content being withdrawn. Its published children
-- deliberately remain published so RLS tests can prove that endpoints control visibility.
update public.map_entities
set publication_status = 'draft'
where id = 'entity-cinder-rival';

commit;
