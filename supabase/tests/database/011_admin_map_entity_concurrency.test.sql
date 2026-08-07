begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(3);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$select public.admin_save_map_entity(
      'entity-map019-stale-row', null, null, 'map019-stale-row', 'character', 'pin',
      'Stale row', '', '', 500, 500, 'category-people', 'draft', '{}'::text[],
      '[{"player_id":"player-demo-one","disposition":"neutral"},{"player_id":"player-demo-two","disposition":"neutral"}]'::jsonb
    )$$,
  'an entity fixture can be created through the atomic editor RPC'
);

select set_config(
  'map019.stale_updated_at',
  ((public.admin_get_map_entity_editor('entity-map019-stale-row')->'record'->>'updated_at')::timestamptz - interval '1 second')::text,
  true
);
select set_config(
  'map019.stale_relations_revision',
  public.admin_get_map_entity_editor('entity-map019-stale-row')->>'relations_revision',
  true
);

select throws_ok(
  $$select public.admin_save_map_entity(
      'entity-map019-stale-row',
      current_setting('map019.stale_updated_at')::timestamptz,
      current_setting('map019.stale_relations_revision'),
      'map019-stale-row', 'character', 'pin', 'Stale row', 'stale overwrite', '', 500, 500,
      'category-people', 'draft', '{}'::text[],
      '[{"player_id":"player-demo-one","disposition":"neutral"},{"player_id":"player-demo-two","disposition":"neutral"}]'::jsonb
    )$$,
  '40001',
  'the entity changed while it was being edited',
  'a stale updated_at blocks an overwrite of the same entity'
);

select is(
  (select summary from public.map_entities where id = 'entity-map019-stale-row'),
  '',
  'the rejected stale save leaves the current entity row unchanged'
);

select * from finish();
rollback;
