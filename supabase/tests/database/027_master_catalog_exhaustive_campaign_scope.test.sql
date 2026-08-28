begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into public.campaigns (id, slug, name, status, display_order)
values (
  '00000000-0000-4000-8000-000000000056',
  'map055-exhaustive-b',
  'MAP055 Exhaustive B',
  'active',
  56
);

insert into public.categories (
  campaign_id, id, slug, name, description, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'category-map055-exhaustive-a', 'map055-exhaustive-a',
  'MAP055 EXHAUSTIVE A CATEGORY', 'A only', 'published'
),
(
  '00000000-0000-4000-8000-000000000056',
  'category-map055-exhaustive-b', 'map055-exhaustive-b',
  'MAP055 EXHAUSTIVE B CATEGORY', 'B only', 'published'
);

insert into public.tags (campaign_id, id, name, description, publication_status)
values
(
  '00000000-0000-4000-8000-000000000053',
  'tag-map055-exhaustive-a', 'MAP055 EXHAUSTIVE A TAG', 'A only', 'published'
),
(
  '00000000-0000-4000-8000-000000000056',
  'tag-map055-exhaustive-b', 'MAP055 EXHAUSTIVE B TAG', 'B only', 'published'
);

insert into public.players (
  campaign_id, id, slug, display_name, publication_status, display_order, accent_color
) values
(
  '00000000-0000-4000-8000-000000000053',
  'player-map055-exhaustive-a', 'map055-exhaustive-a',
  'MAP055 EXHAUSTIVE A PLAYER', 'published', 56, '#334155'
),
(
  '00000000-0000-4000-8000-000000000056',
  'player-map055-exhaustive-b', 'map055-exhaustive-b',
  'MAP055 EXHAUSTIVE B PLAYER', 'published', 56, '#475569'
);

insert into public.map_entities (
  campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
  portrait_path, x, y, category_id, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map055-exhaustive-master-a', 'map055-exhaustive-master-a',
  'character', 'pin', 'master', 'MAP055 EXHAUSTIVE MASTER A',
  'Private A', 'A only', 'portraits/11111111-1111-4111-8111-111111111156.jpg',
  801, 801, 'category-map055-exhaustive-a', 'published'
),
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map055-exhaustive-location-a', 'map055-exhaustive-location-a',
  'location', 'pin', 'public', 'MAP055 EXHAUSTIVE LOCATION A',
  'Public A', 'A endpoint', null,
  811, 811, 'category-map055-exhaustive-a', 'published'
),
(
  '00000000-0000-4000-8000-000000000056',
  'entity-map055-exhaustive-master-b', 'map055-exhaustive-master-b',
  'character', 'pin', 'master', 'MAP055 EXHAUSTIVE MASTER B',
  'Private B', 'B only', 'portraits/22222222-2222-4222-8222-222222222256.webp',
  802, 802, 'category-map055-exhaustive-b', 'published'
),
(
  '00000000-0000-4000-8000-000000000056',
  'entity-map055-exhaustive-location-b', 'map055-exhaustive-location-b',
  'location', 'pin', 'public', 'MAP055 EXHAUSTIVE LOCATION B',
  'Public B', 'B endpoint', null,
  812, 812, 'category-map055-exhaustive-b', 'published'
);

insert into public.entity_tags (
  campaign_id, id, entity_id, tag_id, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'entity-tag-map055-exhaustive-a',
  'entity-map055-exhaustive-master-a', 'tag-map055-exhaustive-a', 'published'
),
(
  '00000000-0000-4000-8000-000000000056',
  'entity-tag-map055-exhaustive-b',
  'entity-map055-exhaustive-master-b', 'tag-map055-exhaustive-b', 'published'
);

update public.entity_player_dispositions
set disposition = 'ally'
where campaign_id = '00000000-0000-4000-8000-000000000053'::uuid
  and entity_id = 'entity-map055-exhaustive-master-a'
  and player_id = 'player-map055-exhaustive-a';

update public.entity_player_dispositions
set disposition = 'enemy'
where campaign_id = '00000000-0000-4000-8000-000000000056'::uuid
  and entity_id = 'entity-map055-exhaustive-master-b'
  and player_id = 'player-map055-exhaustive-b';

insert into public.character_location_relations (
  campaign_id, character_id, location_id, relation_status, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map055-exhaustive-master-a',
  'entity-map055-exhaustive-location-a',
  'present', 'published'
),
(
  '00000000-0000-4000-8000-000000000056',
  'entity-map055-exhaustive-master-b',
  'entity-map055-exhaustive-location-b',
  'associated', 'published'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'entities')
    @> '[{"id":"entity-map055-exhaustive-master-a","portrait_path":"portraits/11111111-1111-4111-8111-111111111156.jpg"}]'::jsonb
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'entities')
      @> '[{"id":"entity-map055-exhaustive-master-b"}]'::jsonb
  ),
  'campaign A entities and portrait_path exclude campaign B'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'entities')
    @> '[{"id":"entity-map055-exhaustive-master-b","portrait_path":"portraits/22222222-2222-4222-8222-222222222256.webp"}]'::jsonb
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'entities')
      @> '[{"id":"entity-map055-exhaustive-master-a"}]'::jsonb
  ),
  'campaign B entities and portrait_path exclude campaign A'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'entity_tags')
    @> '[{"entity_id":"entity-map055-exhaustive-master-a","tag_id":"tag-map055-exhaustive-a"}]'::jsonb
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'entity_tags')
      @> '[{"entity_id":"entity-map055-exhaustive-master-b","tag_id":"tag-map055-exhaustive-b"}]'::jsonb
  ),
  'campaign A entity_tags exclude campaign B IDs'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'entity_tags')
    @> '[{"entity_id":"entity-map055-exhaustive-master-b","tag_id":"tag-map055-exhaustive-b"}]'::jsonb
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'entity_tags')
      @> '[{"entity_id":"entity-map055-exhaustive-master-a","tag_id":"tag-map055-exhaustive-a"}]'::jsonb
  ),
  'campaign B entity_tags exclude campaign A IDs'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'dispositions')
    @> '[{"entity_id":"entity-map055-exhaustive-master-a","player_id":"player-map055-exhaustive-a","disposition":"ally"}]'::jsonb
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'dispositions')
      @> '[{"entity_id":"entity-map055-exhaustive-master-b","player_id":"player-map055-exhaustive-b"}]'::jsonb
  ),
  'campaign A dispositions exclude campaign B'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'dispositions')
    @> '[{"entity_id":"entity-map055-exhaustive-master-b","player_id":"player-map055-exhaustive-b","disposition":"enemy"}]'::jsonb
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'dispositions')
      @> '[{"entity_id":"entity-map055-exhaustive-master-a","player_id":"player-map055-exhaustive-a"}]'::jsonb
  ),
  'campaign B dispositions exclude campaign A'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'relations')
    @> '[{"character_id":"entity-map055-exhaustive-master-a","location_id":"entity-map055-exhaustive-location-a","relation_status":"present"}]'::jsonb
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'relations')
      @> '[{"character_id":"entity-map055-exhaustive-master-b","location_id":"entity-map055-exhaustive-location-b"}]'::jsonb
  ),
  'campaign A relations exclude campaign B endpoints'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'relations')
    @> '[{"character_id":"entity-map055-exhaustive-master-b","location_id":"entity-map055-exhaustive-location-b","relation_status":"associated"}]'::jsonb
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'relations')
      @> '[{"character_id":"entity-map055-exhaustive-master-a","location_id":"entity-map055-exhaustive-location-a"}]'::jsonb
  ),
  'campaign B relations exclude campaign A endpoints'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'relation_entities')
    @> '[{"id":"entity-map055-exhaustive-master-a","audience":"master"},{"id":"entity-map055-exhaustive-location-a","audience":"public"}]'::jsonb
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'relation_entities')
      @> '[{"id":"entity-map055-exhaustive-master-b"}]'::jsonb
  )
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'relation_entities')
      @> '[{"id":"entity-map055-exhaustive-location-b"}]'::jsonb
  ),
  'campaign A relation_entities contain only A endpoints'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'relation_entities')
    @> '[{"id":"entity-map055-exhaustive-master-b","audience":"master"},{"id":"entity-map055-exhaustive-location-b","audience":"public"}]'::jsonb
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'relation_entities')
      @> '[{"id":"entity-map055-exhaustive-master-a"}]'::jsonb
  )
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'relation_entities')
      @> '[{"id":"entity-map055-exhaustive-location-a"}]'::jsonb
  ),
  'campaign B relation_entities contain only B endpoints'
);

select * from finish();
rollback;
