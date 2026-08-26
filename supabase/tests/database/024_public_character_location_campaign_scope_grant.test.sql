begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

select ok(
  has_column_privilege(
    'anon',
    'public.character_location_relations',
    'campaign_id',
    'SELECT'
  ),
  'anon can read the campaign scope required by the multicampaign public relation projection'
);

-- Build dedicated fixtures as the migration/test owner, then exercise only the
-- anonymous projection. Everything rolls back with this test transaction.
insert into public.categories (
  campaign_id, id, slug, name, description, publication_status
) values (
  '00000000-0000-4000-8000-000000000053',
  'category-map053-grant-test',
  'map053-grant-test',
  'MAP053 grant test',
  'Regression fixture for public relation campaign scope',
  'published'
);

insert into public.map_entities (
  campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
  x, y, category_id, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map053-grant-public-character', 'map053-grant-public-character',
  'character', 'pin', 'public', 'MAP053 grant public character', '', '',
  701, 701, 'category-map053-grant-test', 'published'
),
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map053-grant-public-location', 'map053-grant-public-location',
  'location', 'pin', 'public', 'MAP053 grant public location', '', '',
  702, 702, 'category-map053-grant-test', 'published'
),
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map053-grant-draft-location', 'map053-grant-draft-location',
  'location', 'pin', 'public', 'MAP053 grant draft relation target', '', '',
  703, 703, 'category-map053-grant-test', 'published'
),
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map053-grant-master-character', 'map053-grant-master-character',
  'character', 'pin', 'master', 'MAP053 grant MASTER canary', '', '',
  704, 704, 'category-map053-grant-test', 'published'
);

insert into public.character_location_relations (
  campaign_id, character_id, location_id, relation_status, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map053-grant-public-character',
  'entity-map053-grant-public-location',
  'present',
  'published'
),
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map053-grant-public-character',
  'entity-map053-grant-draft-location',
  'associated',
  'draft'
),
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map053-grant-master-character',
  'entity-map053-grant-public-location',
  'last-seen',
  'published'
);

insert into public.campaigns (id, slug, name, status, display_order)
values (
  '00000000-0000-4000-8000-000000000058',
  'map053-grant-archived',
  'MAP053 Grant Archived',
  'active',
  58
);

insert into public.categories (
  campaign_id, id, slug, name, description, publication_status
) values (
  '00000000-0000-4000-8000-000000000058',
  'category-map053-grant-archived',
  'map053-grant-archived',
  'MAP053 archived campaign category',
  'Archived campaign regression fixture',
  'published'
);

insert into public.map_entities (
  campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
  x, y, category_id, publication_status
) values
(
  '00000000-0000-4000-8000-000000000058',
  'entity-map053-grant-archived-character', 'map053-grant-archived-character',
  'character', 'pin', 'public', 'MAP053 archived character', '', '',
  705, 705, 'category-map053-grant-archived', 'published'
),
(
  '00000000-0000-4000-8000-000000000058',
  'entity-map053-grant-archived-location', 'map053-grant-archived-location',
  'location', 'pin', 'public', 'MAP053 archived location', '', '',
  706, 706, 'category-map053-grant-archived', 'published'
);

insert into public.character_location_relations (
  campaign_id, character_id, location_id, relation_status, publication_status
) values (
  '00000000-0000-4000-8000-000000000058',
  'entity-map053-grant-archived-character',
  'entity-map053-grant-archived-location',
  'present',
  'published'
);

update public.campaigns
set status = 'archived'
where id = '00000000-0000-4000-8000-000000000058';

set local role anon;

-- This is the shape used by the remote snapshot reader: campaign_id is a
-- filter discriminator, not a projected output field.
select lives_ok(
  $$select character_id, location_id, relation_status
    from public.character_location_relations
    where campaign_id = '00000000-0000-4000-8000-000000000053'::uuid$$,
  'anon can execute the exact campaign-filtered public relation query used by the snapshot reader'
);

select ok(
  exists (
    select character_id
    from public.character_location_relations
    where campaign_id = '00000000-0000-4000-8000-000000000053'::uuid
      and character_id = 'entity-map053-grant-public-character'
      and location_id = 'entity-map053-grant-public-location'
  ),
  'RLS keeps a published relation with public endpoints visible to anon'
);

select ok(
  not exists (
    select character_id
    from public.character_location_relations
    where campaign_id = '00000000-0000-4000-8000-000000000053'::uuid
      and character_id = 'entity-map053-grant-public-character'
      and location_id = 'entity-map053-grant-draft-location'
  ),
  'RLS hides a draft relation even after anon can filter by campaign_id'
);

select ok(
  not exists (
    select character_id
    from public.character_location_relations
    where campaign_id = '00000000-0000-4000-8000-000000000053'::uuid
      and character_id = 'entity-map053-grant-master-character'
      and location_id = 'entity-map053-grant-public-location'
  ),
  'RLS hides a published relation whose character endpoint has master audience'
);

select ok(
  not exists (
    select character_id
    from public.character_location_relations
    where campaign_id = '00000000-0000-4000-8000-000000000058'::uuid
      and character_id = 'entity-map053-grant-archived-character'
      and location_id = 'entity-map053-grant-archived-location'
  ),
  'RLS hides published relations that belong to an archived campaign'
);

select * from finish();
rollback;
