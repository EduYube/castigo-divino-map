begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

select ok(
  not has_function_privilege('anon', 'public.admin_get_map_entity_editor(text)', 'execute'),
  'anonymous visitors cannot execute the administrative entity editor snapshot RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_get_map_entity_editor(text)', 'execute'),
  'authenticated sessions receive only the RPC execute surface and still depend on RLS/admin authorization'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$select public.admin_save_map_entity(
      'entity-map019-denied', null, null, 'map019-denied', 'character', 'pin',
      'Denied', '', '', 10, 10, 'category-people', 'draft', '{}'::text[],
      '[{"player_id":"player-demo-one","disposition":"neutral"},{"player_id":"player-demo-two","disposition":"neutral"}]'::jsonb
    )$$,
  '42501',
  'administrative authorization required',
  'an authenticated non-admin cannot mutate an entity through the RPC'
);
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$select public.admin_save_map_entity(
      'entity-map019-test', null, null, 'map019-test', 'character', 'pin',
      'MAP-019 Test', 'Draft summary', 'Draft description', 1800, 1200,
      'category-people', 'draft', array['notable'],
      '[{"player_id":"player-demo-one","disposition":"ally"},{"player_id":"player-demo-two","disposition":"neutral"}]'::jsonb
    )$$,
  'administrator can atomically create a draft entity with tags and dispositions'
);
select ok(
  length(public.admin_get_map_entity_editor('entity-map019-test')->>'relations_revision') > 0,
  'editor snapshots include a relation revision for optimistic concurrency'
);

reset role;
set local role anon;
select is(
  (select count(*) from public.map_entities where id = 'entity-map019-test'),
  0::bigint,
  'saving a draft does not expose it to anonymous readers'
);
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$with snapshot as (
      select public.admin_get_map_entity_editor('entity-map019-test') as data
    )
    select public.admin_save_map_entity(
      'entity-map019-test',
      (data->'record'->>'updated_at')::timestamptz,
      data->>'relations_revision',
      'map019-test', 'character', 'pin', 'MAP-019 Test', 'Published summary',
      'Published description', 1801, 1201, 'category-people', 'published',
      array['notable'],
      '[{"player_id":"player-demo-one","disposition":"ally"},{"player_id":"player-demo-two","disposition":"enemy"}]'::jsonb
    )
    from snapshot$$,
  'publishing entity, tag relation and dispositions succeeds in one transaction'
);
reset role;

set local role anon;
select is(
  (select count(*) from public.map_entities where id = 'entity-map019-test'),
  1::bigint,
  'the published entity appears in the public RLS projection'
);
select is(
  (select count(*) from public.entity_tags where entity_id = 'entity-map019-test' and tag_id = 'notable'),
  1::bigint,
  'the selected published tag relation appears with the entity'
);
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$with snapshot as (
      select public.admin_get_map_entity_editor('entity-map019-test') as data
    )
    select public.admin_save_map_entity(
      'entity-map019-test',
      (data->'record'->>'updated_at')::timestamptz,
      data->>'relations_revision',
      'map019-test', 'character', 'pin', 'MAP-019 Test', 'Published summary',
      'Published description', 1801, 1201, 'category-people', 'archived',
      array['notable'],
      '[{"player_id":"player-demo-one","disposition":"ally"},{"player_id":"player-demo-two","disposition":"enemy"}]'::jsonb
    )
    from snapshot$$,
  'archiving an entity preserves its editor relations while withdrawing the entity'
);
reset role;
set local role anon;
select is(
  (select count(*) from public.map_entities where id = 'entity-map019-test'),
  0::bigint,
  'archiving removes the entity from the public projection'
);
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$select public.admin_save_map_entity(
      'entity-map019-invalid-tag', null, null, 'map019-invalid-tag', 'character', 'pin',
      'Invalid tag', '', '', 100, 100, 'category-people', 'published', array['draft-tag'],
      '[{"player_id":"player-demo-one","disposition":"neutral"},{"player_id":"player-demo-two","disposition":"neutral"}]'::jsonb
    )$$,
  '23514',
  'published entities require published tags',
  'publishing with an invalid tag relation is blocked clearly'
);
select is(
  (select count(*) from public.map_entities where id = 'entity-map019-invalid-tag'),
  0::bigint,
  'failed relation validation leaves no partially created entity'
);

select throws_ok(
  $$select public.admin_save_map_entity(
      'entity-map019-atomic', null, null, 'map019-atomic', 'character', 'pin',
      'Atomic failure', '', '', 100, 100, 'category-people', 'draft', '{}'::text[],
      '[{"player_id":"player-demo-one","disposition":"neutral"}]'::jsonb
    )$$,
  '23514',
  'dispositions no longer match the player matrix',
  'a disposition mismatch aborts the whole entity save'
);
select is(
  (select count(*) from public.map_entities where id = 'entity-map019-atomic'),
  0::bigint,
  'a relation failure rolls back the entity row atomically'
);

select lives_ok(
  $$select public.admin_save_map_entity(
      'entity-map019-concurrent', null, null, 'map019-concurrent', 'character', 'pin',
      'Concurrent', '', '', 200, 200, 'category-people', 'draft', '{}'::text[],
      '[{"player_id":"player-demo-one","disposition":"neutral"},{"player_id":"player-demo-two","disposition":"neutral"}]'::jsonb
    )$$,
  'a concurrent-edit fixture can be created'
);
select set_config(
  'map019.old_updated_at',
  public.admin_get_map_entity_editor('entity-map019-concurrent')->'record'->>'updated_at',
  true
);
select set_config(
  'map019.old_relation_revision',
  public.admin_get_map_entity_editor('entity-map019-concurrent')->>'relations_revision',
  true
);
update public.entity_player_dispositions
set disposition = 'enemy'
where entity_id = 'entity-map019-concurrent'
  and player_id = 'player-demo-one';
select throws_ok(
  $$select public.admin_save_map_entity(
      'entity-map019-concurrent',
      current_setting('map019.old_updated_at')::timestamptz,
      current_setting('map019.old_relation_revision'),
      'map019-concurrent', 'character', 'pin', 'Concurrent', '', '', 200, 200,
      'category-people', 'draft', '{}'::text[],
      '[{"player_id":"player-demo-one","disposition":"neutral"},{"player_id":"player-demo-two","disposition":"neutral"}]'::jsonb
    )$$,
  '40001',
  'entity relations changed while the editor was open',
  'a relation changed while the editor was open blocks a stale save'
);

select throws_ok(
  $$delete from public.map_entities where id = 'entity-map019-test'$$,
  '23514',
  'published content cannot be physically deleted by the application',
  'historically published entities cannot be physically deleted'
);

select lives_ok(
  $$select public.admin_save_map_entity(
      'entity-map019-disposable', null, null, 'map019-disposable', 'location', 'search_only',
      'Disposable', '', '', 300, 300, 'category-places', 'draft', '{}'::text[],
      '[{"player_id":"player-demo-one","disposition":"neutral"},{"player_id":"player-demo-two","disposition":"neutral"}]'::jsonb
    )$$,
  'a never-published entity without editorial relations can be created'
);
select lives_ok(
  $$delete from public.map_entities where id = 'entity-map019-disposable'$$,
  'never-published unreferenced entity can be physically deleted; its generated disposition matrix cascades'
);

select lives_ok(
  $$select public.admin_save_map_entity(
      'entity-map019-referenced', null, null, 'map019-referenced', 'location', 'pin',
      'Referenced', '', '', 400, 400, 'category-places', 'draft', array['notable'],
      '[{"player_id":"player-demo-one","disposition":"neutral"},{"player_id":"player-demo-two","disposition":"neutral"}]'::jsonb
    )$$,
  'a draft with an explicit tag relation can be created'
);
select throws_ok(
  $$delete from public.map_entities where id = 'entity-map019-referenced'$$,
  '23503',
  null,
  'foreign keys block physical deletion while an explicit relation exists'
);

select * from finish();
rollback;
