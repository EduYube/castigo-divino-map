begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

insert into public.campaigns (id, slug, name, status, display_order)
values (
  '00000000-0000-4000-8000-000000000056',
  'map055-metadata-b',
  'MAP055 Metadata Campaign B',
  'active',
  56
);

insert into public.categories (
  campaign_id, id, slug, name, description, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'category-map055-meta-a', 'map055-meta-a', 'MAP055 META A CATEGORY', 'A only', 'published'
),
(
  '00000000-0000-4000-8000-000000000056',
  'category-map055-meta-b', 'map055-meta-b', 'MAP055 META B CATEGORY', 'B only', 'published'
);

insert into public.tags (campaign_id, id, name, description, publication_status)
values
(
  '00000000-0000-4000-8000-000000000053',
  'tag-map055-meta-a', 'MAP055 META A TAG', 'A only', 'published'
),
(
  '00000000-0000-4000-8000-000000000056',
  'tag-map055-meta-b', 'MAP055 META B TAG', 'B only', 'published'
);

insert into public.players (
  campaign_id, id, slug, display_name, publication_status, display_order, accent_color
) values
(
  '00000000-0000-4000-8000-000000000053',
  'player-map055-meta-a', 'map055-meta-a', 'MAP055 META A PLAYER', 'published', 56, '#334155'
),
(
  '00000000-0000-4000-8000-000000000056',
  'player-map055-meta-b', 'map055-meta-b', 'MAP055 META B PLAYER', 'published', 56, '#475569'
);

insert into public.map_entities (
  campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
  x, y, category_id, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map055-meta-a', 'map055-meta-a', 'location', 'pin', 'master',
  'MAP055 META A MASTER', 'Private A', 'A only',
  731, 731, 'category-map055-meta-a', 'published'
),
(
  '00000000-0000-4000-8000-000000000056',
  'entity-map055-meta-b', 'map055-meta-b', 'location', 'pin', 'master',
  'MAP055 META B MASTER', 'Private B', 'B only',
  732, 732, 'category-map055-meta-b', 'published'
);

insert into public.entity_aliases (
  campaign_id, id, entity_id, language, value, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'alias-map055-meta-a', 'entity-map055-meta-a', 'en', 'MAP055 META A ALIAS', 'published'
),
(
  '00000000-0000-4000-8000-000000000056',
  'alias-map055-meta-b', 'entity-map055-meta-b', 'en', 'MAP055 META B ALIAS', 'published'
);

insert into public.entity_tags (
  campaign_id, id, entity_id, tag_id, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'entity-tag-map055-meta-a', 'entity-map055-meta-a', 'tag-map055-meta-a', 'published'
),
(
  '00000000-0000-4000-8000-000000000056',
  'entity-tag-map055-meta-b', 'entity-map055-meta-b', 'tag-map055-meta-b', 'published'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'categories')
    @> '[{"id":"category-map055-meta-a","name":"MAP055 META A CATEGORY"}]'::jsonb
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'categories')
      @> '[{"id":"category-map055-meta-b"}]'::jsonb
  ),
  'campaign A categories contain A and exclude B'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'categories')
    @> '[{"id":"category-map055-meta-b","name":"MAP055 META B CATEGORY"}]'::jsonb
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'categories')
      @> '[{"id":"category-map055-meta-a"}]'::jsonb
  ),
  'campaign B categories contain B and exclude A'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'aliases')
    @> '[{"id":"alias-map055-meta-a","entity_id":"entity-map055-meta-a","value":"MAP055 META A ALIAS"}]'::jsonb
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'aliases')
      @> '[{"id":"alias-map055-meta-b"}]'::jsonb
  ),
  'campaign A aliases contain A and exclude B'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'aliases')
    @> '[{"id":"alias-map055-meta-b","entity_id":"entity-map055-meta-b","value":"MAP055 META B ALIAS"}]'::jsonb
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'aliases')
      @> '[{"id":"alias-map055-meta-a"}]'::jsonb
  ),
  'campaign B aliases contain B and exclude A'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'tags')
    @> '[{"id":"tag-map055-meta-a","name":"MAP055 META A TAG"}]'::jsonb
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'tags')
      @> '[{"id":"tag-map055-meta-b"}]'::jsonb
  ),
  'campaign A tags contain A and exclude B'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'tags')
    @> '[{"id":"tag-map055-meta-b","name":"MAP055 META B TAG"}]'::jsonb
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'tags')
      @> '[{"id":"tag-map055-meta-a"}]'::jsonb
  ),
  'campaign B tags contain B and exclude A'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'players')
    @> '[{"id":"player-map055-meta-a","display_name":"MAP055 META A PLAYER"}]'::jsonb
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'players')
      @> '[{"id":"player-map055-meta-b"}]'::jsonb
  ),
  'campaign A players contain A and exclude B'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'players')
    @> '[{"id":"player-map055-meta-b","display_name":"MAP055 META B PLAYER"}]'::jsonb
  and not (
    (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000056'::uuid) -> 'players')
      @> '[{"id":"player-map055-meta-a"}]'::jsonb
  ),
  'campaign B players contain B and exclude A'
);

select * from finish();
rollback;
