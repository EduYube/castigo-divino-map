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

select plan(20);

select has_table('public', 'entity_player_associations', 'MAP-058 association table exists');
select has_column('public', 'entity_player_associations', 'campaign_id', 'associations carry campaign identity');
select has_column('public', 'entity_player_associations', 'entity_id', 'associations reference entities');
select has_column('public', 'entity_player_associations', 'player_id', 'associations reference players');

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

insert into public.campaigns (id, slug, name, status, display_order)
values
  ('00000000-0000-4000-8000-000000000580', 'map058-a', 'MAP058 A', 'active', 580),
  ('00000000-0000-4000-8000-000000000581', 'map058-b', 'MAP058 B', 'active', 581);

insert into public.categories (campaign_id, id, slug, name, description, publication_status)
values
  ('00000000-0000-4000-8000-000000000580', 'category-map058-a', 'map058-a', 'MAP058 A', '', 'published'),
  ('00000000-0000-4000-8000-000000000581', 'category-map058-b', 'map058-b', 'MAP058 B', '', 'published');

insert into public.players (
  campaign_id, id, slug, display_name, publication_status, display_order, accent_color
) values
  ('00000000-0000-4000-8000-000000000580', 'player-map058-a', 'map058-a', 'MAP058 Player A', 'published', 1, '#c2410c'),
  ('00000000-0000-4000-8000-000000000581', 'player-map058-b', 'map058-b', 'MAP058 Player B', 'published', 1, '#1e3a8a');

insert into public.map_entities (
  campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
  x, y, category_id, publication_status
) values
  ('00000000-0000-4000-8000-000000000580', 'entity-map058-public-a', 'map058-public-a', 'location', 'pin', 'public', 'MAP058 Public A', '', '', 580, 580, 'category-map058-a', 'published'),
  ('00000000-0000-4000-8000-000000000580', 'entity-map058-master-a', 'map058-master-a', 'character', 'pin', 'master', 'MAP058 Master A', '', '', 581, 581, 'category-map058-a', 'published');

select lives_ok(
  $$insert into public.entity_player_associations (campaign_id, entity_id, player_id)
    values ('00000000-0000-4000-8000-000000000580', 'entity-map058-public-a', 'player-map058-a')$$,
  'admin can create an association inside one campaign'
);

select is(
  (select count(*) from public.entity_player_associations where entity_id = 'entity-map058-public-a'),
  1::bigint,
  'one persistent association is stored independently'
);

select ok(
  pg_temp.statement_fails($sql$
    insert into public.entity_player_associations (campaign_id, entity_id, player_id)
    values ('00000000-0000-4000-8000-000000000580', 'entity-map058-public-a', 'player-map058-b')
  $sql$),
  'composite foreign keys reject a raw cross-campaign association'
);

select ok(
  (public.admin_get_map_entity_editor_v5(
    '00000000-0000-4000-8000-000000000580', 'entity-map058-public-a'
  ) -> 'associations') @> '[{"player_id":"player-map058-a","accent_color":"#c2410c"}]'::jsonb,
  'v5 editor returns associated player identity and persisted accent'
);

select ok(
  pg_temp.statement_fails($sql$
    select public.admin_save_map_entity_v5(
      '00000000-0000-4000-8000-000000000580',
      'entity-map058-public-a',
      (select updated_at from public.map_entities where id = 'entity-map058-public-a'),
      (public.admin_get_map_entity_editor_v5('00000000-0000-4000-8000-000000000580', 'entity-map058-public-a') ->> 'relations_revision'),
      'map058-public-a', 'location', 'pin', 'public', null,
      'MAP058 Public A', '', '', 580, 580, 'category-map058-a', 'published', '{}'::text[],
      '[{"playerId":"player-map058-a","disposition":"neutral"}]'::jsonb,
      array['player-map058-b']
    )
  $sql$),
  'v5 editor rejects a manipulated cross-campaign player id'
);

select lives_ok(
  $sql$
    select public.admin_save_map_entity_v5(
      '00000000-0000-4000-8000-000000000580',
      'entity-map058-public-a',
      (select updated_at from public.map_entities where id = 'entity-map058-public-a'),
      (public.admin_get_map_entity_editor_v5('00000000-0000-4000-8000-000000000580', 'entity-map058-public-a') ->> 'relations_revision'),
      'map058-public-a', 'location', 'pin', 'public', null,
      'MAP058 Public A', '', '', 580, 580, 'category-map058-a', 'published', '{}'::text[],
      '[{"playerId":"player-map058-a","disposition":"neutral"}]'::jsonb,
      '{}'::text[]
    )
  $sql$,
  'editing associations can remove every active association'
);

select is(
  (select disposition::text from public.entity_player_dispositions
   where entity_id = 'entity-map058-public-a' and player_id = 'player-map058-a'),
  'neutral'::text,
  'editing associations does not alter MAP-057 dispositions'
);

select lives_ok(
  $sql$
    select public.admin_save_map_entity_v5(
      '00000000-0000-4000-8000-000000000580',
      'entity-map058-public-a',
      (select updated_at from public.map_entities where id = 'entity-map058-public-a'),
      (public.admin_get_map_entity_editor_v5('00000000-0000-4000-8000-000000000580', 'entity-map058-public-a') ->> 'relations_revision'),
      'map058-public-a', 'location', 'pin', 'public', null,
      'MAP058 Public A', '', '', 580, 580, 'category-map058-a', 'published', '{}'::text[],
      '[{"playerId":"player-map058-a","disposition":"ally"}]'::jsonb,
      array['player-map058-a']
    )
  $sql$,
  'association and disposition can be saved independently in one atomic editor call'
);

select is(
  (select count(*) from public.entity_player_associations
   where entity_id = 'entity-map058-public-a' and player_id = 'player-map058-a'),
  1::bigint,
  'editing disposition leaves the selected association intact'
);

update public.players set publication_status = 'archived' where id = 'player-map058-a';
select is(
  (select count(*) from public.entity_player_associations
   where entity_id = 'entity-map058-public-a' and player_id = 'player-map058-a'),
  1::bigint,
  'archiving a player preserves association history'
);
update public.players set publication_status = 'draft' where id = 'player-map058-a';
update public.players set publication_status = 'published' where id = 'player-map058-a';

update public.map_entities set publication_status = 'archived' where id = 'entity-map058-public-a';
select is(
  (select count(*) from public.entity_player_associations
   where entity_id = 'entity-map058-public-a' and player_id = 'player-map058-a'),
  1::bigint,
  'archiving an entity preserves association history'
);
update public.map_entities set publication_status = 'draft' where id = 'entity-map058-public-a';
update public.map_entities set publication_status = 'published' where id = 'entity-map058-public-a';

insert into public.entity_player_associations (campaign_id, entity_id, player_id)
values ('00000000-0000-4000-8000-000000000580', 'entity-map058-master-a', 'player-map058-a');

select ok(
  (public.admin_get_master_catalog_v4('00000000-0000-4000-8000-000000000580') -> 'associations')
    @> '[{"entity_id":"entity-map058-master-a","player_id":"player-map058-a"}]'::jsonb,
  'authorized Master catalog includes private associations'
);
select ok(
  (public.admin_get_master_catalog_v4('00000000-0000-4000-8000-000000000580') -> 'players')
    @> '[{"id":"player-map058-a","accent_color":"#c2410c"}]'::jsonb,
  'authorized Master catalog includes data-driven player accents'
);

reset role;
set local role anon;

select is(
  (select count(*) from public.entity_player_associations where entity_id = 'entity-map058-public-a'),
  1::bigint,
  'anon can read an authorized public association'
);
select is(
  (select count(*) from public.entity_player_associations where entity_id = 'entity-map058-master-a'),
  0::bigint,
  'anon cannot infer Master associations through direct table reads'
);
select ok(
  pg_temp.statement_fails($sql$
    insert into public.entity_player_associations (campaign_id, entity_id, player_id)
    values ('00000000-0000-4000-8000-000000000580', 'entity-map058-master-a', 'player-map058-a')
  $sql$),
  'anon cannot write associations'
);

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select ok(
  pg_temp.statement_fails($sql$
    select public.admin_get_map_entity_editor_v5(
      '00000000-0000-4000-8000-000000000580', 'entity-map058-public-a'
    )
  $sql$),
  'authenticated non-admin cannot inspect the association editor payload'
);

select * from finish();
rollback;
