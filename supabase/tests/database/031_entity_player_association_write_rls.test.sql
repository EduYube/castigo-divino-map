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

select plan(3);

-- Seed one valid association as the real admin so DELETE can be probed directly.
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

insert into public.entity_player_associations (campaign_id, entity_id, player_id)
select entity.campaign_id, entity.id, player.id
from public.map_entities as entity
join public.players as player
  on player.campaign_id = entity.campaign_id
where entity.id = 'entity-aster-guide'
  and player.id = 'player-demo-one';

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select ok(
  pg_temp.statement_fails($sql$
    insert into public.entity_player_associations (campaign_id, entity_id, player_id)
    select entity.campaign_id, entity.id, player.id
    from public.map_entities as entity
    join public.players as player
      on player.campaign_id = entity.campaign_id
    where entity.id = 'entity-aster-guide'
      and player.id = 'player-demo-two'
  $sql$),
  'authenticated non-admin cannot INSERT an otherwise valid association'
);

select is(
  (with deleted as (
    delete from public.entity_player_associations
    where entity_id = 'entity-aster-guide'
      and player_id = 'player-demo-one'
    returning 1
  )
  select count(*) from deleted),
  0::bigint,
  'authenticated non-admin DELETE is filtered to zero rows by RLS'
);

select is(
  (select count(*) from public.entity_player_associations
   where entity_id = 'entity-aster-guide'
     and player_id = 'player-demo-one'),
  1::bigint,
  'the denied DELETE leaves the association intact'
);

select * from finish();
rollback;