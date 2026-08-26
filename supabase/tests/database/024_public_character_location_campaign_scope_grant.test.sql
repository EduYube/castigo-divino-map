begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(2);

select ok(
  has_column_privilege(
    'anon',
    'public.character_location_relations',
    'campaign_id',
    'SELECT'
  ),
  'anon can read the campaign scope required by the multicampaign public relation projection'
);

set local role anon;
select lives_ok(
  $$select campaign_id, character_id, location_id, relation_status
    from public.character_location_relations
    limit 1$$,
  'the anonymous public relation projection can include campaign_id without bypassing RLS'
);

select * from finish();
rollback;
