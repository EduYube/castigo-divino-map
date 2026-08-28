begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create function pg_temp.statement_fails(statement text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return false;
exception
  when others then
    return true;
end;
$$;

select plan(24);

select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_get_master_catalog_v3(uuid)',
    'execute'
  ),
  'authenticated role may invoke the campaign-scoped Master catalog RPC'
);

select ok(
  not has_function_privilege('anon', 'public.admin_get_master_catalog_v3(uuid)', 'execute'),
  'anon cannot execute the campaign-scoped Master catalog RPC'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select ok(
  pg_temp.statement_fails($sql$
    select public.admin_get_master_catalog_v3(
      '00000000-0000-4000-8000-000000000053'::uuid
    )
  $sql$),
  'authenticated non-admin cannot read private campaign content'
);

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

insert into public.campaigns (id, slug, name, status, display_order)
values (
  '00000000-0000-4000-8000-000000000055',
  'map055-campaign-b',
  'MAP055 Campaign B',
  'active',
  55
);

insert into public.categories (
  campaign_id, id, slug, name, description, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'category-map055-a', 'map055-a', 'MAP055 A CATEGORY CANARY', 'A only', 'published'
),
(
  '00000000-0000-4000-8000-000000000055',
  'category-map055-b', 'map055-b', 'MAP055 B CATEGORY CANARY', 'B only', 'published'
);

insert into public.tags (campaign_id, id, name, description, publication_status)
values
(
  '00000000-0000-4000-8000-000000000053',
  'tag-map055-a', 'MAP055 A TAG CANARY', 'A only', 'published'
),
(
  '00000000-0000-4000-8000-000000000055',
  'tag-map055-b', 'MAP055 B TAG CANARY', 'B only', 'published'
);

insert into public.players (
  campaign_id, id, slug, display_name, publication_status, display_order, accent_color
) values
(
  '00000000-0000-4000-8000-000000000053',
  'player-map055-a', 'map055-a', 'MAP055 A PLAYER CANARY', 'published', 55, '#334155'
),
(
  '00000000-0000-4000-8000-000000000055',
  'player-map055-b', 'map055-b', 'MAP055 B PLAYER CANARY', 'published', 55, '#334155'
);

insert into public.map_entities (
  campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
  portrait_path, x, y, category_id, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map055-master-a', 'map055-master-a', 'character', 'pin', 'master',
  'MAP055 A MASTER CANARY', 'Private A', 'Must never enter B',
  'portraits/11111111-1111-4111-8111-111111111111.jpg',
  701, 701, 'category-map055-a', 'published'
),
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map055-location-a', 'map055-location-a', 'location', 'pin', 'public',
  'MAP055 A LOCATION CANARY', 'Public A endpoint', 'A relation endpoint',
  null,
  711, 711, 'category-map055-a', 'published'
),
(
  '00000000-0000-4000-8000-000000000055',
  'entity-map055-master-b', 'map055-master-b', 'character', 'pin', 'master',
  'MAP055 B MASTER CANARY', 'Private B', 'Must never enter A',
  'portraits/22222222-2222-4222-8222-222222222222.webp',
  702, 702, 'category-map055-b', 'published'
),
(
  '00000000-0000-4000-8000-000000000055',
  'entity-map055-location-b', 'map055-location-b', 'location', 'pin', 'public',
  'MAP055 B LOCATION CANARY', 'Public B endpoint', 'B relation endpoint',
  null,
  712, 712, 'category-map055-b', 'published'
);

insert into public.entity_aliases (
  campaign_id, id, entity_id, language, value, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'alias-map055-a', 'entity-map055-master-a', 'en', 'MAP055 A ALIAS CANARY', 'published'
),
(
  '00000000-0000-4000-8000-000000000055',
  'alias-map055-b', 'entity-map055-master-b', 'en', 'MAP055 B ALIAS CANARY', 'published'
);

insert into public.entity_tags (
  campaign_id, id, entity_id, tag_id, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'entity-tag-map055-a', 'entity-map055-master-a', 'tag-map055-a', 'published'
),
(
  '00000000-0000-4000-8000-000000000055',
  'entity-tag-map055-b', 'entity-map055-master-b', 'tag-map055-b', 'published'
);

update public.entity_player_dispositions
set disposition = 'ally'
where campaign_id = '00000000-0000-4000-8000-000000000053'::uuid
  and entity_id = 'entity-map055-master-a'
  and player_id = 'player-map055-a';

update public.entity_player_dispositions
set disposition = 'enemy'
where campaign_id = '00000000-0000-4000-8000-000000000055'::uuid
  and entity_id = 'entity-map055-master-b'
  and player_id = 'player-map055-b';

insert into public.character_location_relations (
  campaign_id, character_id, location_id, relation_status, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map055-master-a', 'entity-map055-location-a', 'present', 'published'
),
(
  '00000000-0000-4000-8000-000000000055',
  'entity-map055-master-b', 'entity-map055-location-b', 'associated', 'published'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'entities')
    @> '[{"id":"entity-map055-master-a","portrait_path":"portraits/11111111-1111-4111-8111-111111111111.jpg"}]'::jsonb
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'entities') @> '[{"id":"entity-map055-master-b"}]'::jsonb)
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'entities') @> '[{"portrait_path":"portraits/22222222-2222-4222-8222-222222222222.webp"}]'::jsonb),
  'campaign A entities contain only the A Master/portrait canary'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'entities')
    @> '[{"id":"entity-map055-master-b","portrait_path":"portraits/22222222-2222-4222-8222-222222222222.webp"}]'::jsonb
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'entities') @> '[{"id":"entity-map055-master-a"}]'::jsonb)
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'entities') @> '[{"portrait_path":"portraits/11111111-1111-4111-8111-111111111111.jpg"}]'::jsonb),
  'campaign B entities contain only the B Master/portrait canary'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'categories') @> '[{"id":"category-map055-a","name":"MAP055 A CATEGORY CANARY"}]'::jsonb
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'categories') @> '[{"id":"category-map055-b"}]'::jsonb),
  'campaign A categories exclude campaign B'
);
select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'categories') @> '[{"id":"category-map055-b","name":"MAP055 B CATEGORY CANARY"}]'::jsonb
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'categories') @> '[{"id":"category-map055-a"}]'::jsonb),
  'campaign B categories exclude campaign A'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'aliases') @> '[{"id":"alias-map055-a","entity_id":"entity-map055-master-a","value":"MAP055 A ALIAS CANARY"}]'::jsonb
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'aliases') @> '[{"id":"alias-map055-b"}]'::jsonb),
  'campaign A aliases exclude campaign B'
);
select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'aliases') @> '[{"id":"alias-map055-b","entity_id":"entity-map055-master-b","value":"MAP055 B ALIAS CANARY"}]'::jsonb
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'aliases') @> '[{"id":"alias-map055-a"}]'::jsonb),
  'campaign B aliases exclude campaign A'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'tags') @> '[{"id":"tag-map055-a","name":"MAP055 A TAG CANARY"}]'::jsonb
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'tags') @> '[{"id":"tag-map055-b"}]'::jsonb),
  'campaign A tags exclude campaign B'
);
select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'tags') @> '[{"id":"tag-map055-b","name":"MAP055 B TAG CANARY"}]'::jsonb
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'tags') @> '[{"id":"tag-map055-a"}]'::jsonb),
  'campaign B tags exclude campaign A'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'entity_tags') @> '[{"entity_id":"entity-map055-master-a","tag_id":"tag-map055-a"}]'::jsonb
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'entity_tags') @> '[{"entity_id":"entity-map055-master-b","tag_id":"tag-map055-b"}]'::jsonb),
  'campaign A entity_tags exclude campaign B IDs'
);
select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'entity_tags') @> '[{"entity_id":"entity-map055-master-b","tag_id":"tag-map055-b"}]'::jsonb
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'entity_tags') @> '[{"entity_id":"entity-map055-master-a","tag_id":"tag-map055-a"}]'::jsonb),
  'campaign B entity_tags exclude campaign A IDs'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'players') @> '[{"id":"player-map055-a","display_name":"MAP055 A PLAYER CANARY"}]'::jsonb
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'players') @> '[{"id":"player-map055-b"}]'::jsonb),
  'campaign A players exclude campaign B'
);
select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'players') @> '[{"id":"player-map055-b","display_name":"MAP055 B PLAYER CANARY"}]'::jsonb
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'players') @> '[{"id":"player-map055-a"}]'::jsonb),
  'campaign B players exclude campaign A'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'dispositions') @> '[{"entity_id":"entity-map055-master-a","player_id":"player-map055-a","disposition":"ally"}]'::jsonb
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'dispositions') @> '[{"entity_id":"entity-map055-master-b","player_id":"player-map055-b"}]'::jsonb),
  'campaign A dispositions exclude campaign B'
);
select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'dispositions') @> '[{"entity_id":"entity-map055-master-b","player_id":"player-map055-b","disposition":"enemy"}]'::jsonb
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'dispositions') @> '[{"entity_id":"entity-map055-master-a","player_id":"player-map055-a"}]'::jsonb),
  'campaign B dispositions exclude campaign A'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'relations') @> '[{"character_id":"entity-map055-master-a","location_id":"entity-map055-location-a","relation_status":"present"}]'::jsonb
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'relations') @> '[{"character_id":"entity-map055-master-b","location_id":"entity-map055-location-b"}]'::jsonb),
  'campaign A relations exclude campaign B endpoints'
);
select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'relations') @> '[{"character_id":"entity-map055-master-b","location_id":"entity-map055-location-b","relation_status":"associated"}]'::jsonb
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'relations') @> '[{"character_id":"entity-map055-master-a","location_id":"entity-map055-location-a"}]'::jsonb),
  'campaign B relations exclude campaign A endpoints'
);

select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'relation_entities') @> '[{"id":"entity-map055-master-a","audience":"master"},{"id":"entity-map055-location-a","audience":"public"}]'::jsonb
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'relation_entities') @> '[{"id":"entity-map055-master-b"}]'::jsonb)
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid) -> 'relation_entities') @> '[{"id":"entity-map055-location-b"}]'::jsonb),
  'campaign A relation_entities contain only A endpoints'
);
select ok(
  (public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'relation_entities') @> '[{"id":"entity-map055-master-b","audience":"master"},{"id":"entity-map055-location-b","audience":"public"}]'::jsonb
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'relation_entities') @> '[{"id":"entity-map055-master-a"}]'::jsonb)
  and not ((public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000055'::uuid) -> 'relation_entities') @> '[{"id":"entity-map055-location-a"}]'::jsonb),
  'campaign B relation_entities contain only B endpoints'
);

select is(
  pg_catalog.jsonb_typeof(
    public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid)
  ),
  'object',
  'authorized admin can read the initial active campaign through v3'
);

update public.campaigns
set status = 'archived'
where id = '00000000-0000-4000-8000-000000000055'::uuid;

select ok(
  pg_temp.statement_fails($sql$
    select public.admin_get_master_catalog_v3(
      '00000000-0000-4000-8000-000000000055'::uuid
    )
  $sql$),
  'campaign-scoped Master RPC rejects archived campaigns fail-closed'
);

select ok(
  pg_temp.statement_fails($sql$
    select public.admin_get_master_catalog_v3(
      '00000000-0000-4000-8000-000000000099'::uuid
    )
  $sql$),
  'campaign-scoped Master RPC rejects nonexistent campaigns fail-closed'
);

select * from finish();
rollback;
