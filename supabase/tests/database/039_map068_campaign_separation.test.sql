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
  when others then return true;
end;
$$;

select plan(12);

select is(
  (select count(*) from public.campaigns
   where id='00000000-0000-4000-8000-000000000068'::uuid
     and slug='un-aliento-menos' and name='Un aliento menos'),
  1::bigint,
  'second campaign exists exactly once'
);
select has_column('public','players','character_entity_id','players expose explicit character identity');
select fk_ok(
  'public','players','players_character_entity_campaign_fk',
  'public','map_entities',
  'player identity is campaign-bound'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

insert into public.categories (
  campaign_id,id,slug,name,description,publication_status
) values (
  '00000000-0000-4000-8000-000000000068',
  'category-map068-test','map068-test','MAP068 test','MAP068 test','published'
);

insert into public.players (
  campaign_id,id,slug,display_name,publication_status,display_order,accent_color
) values (
  '00000000-0000-4000-8000-000000000068',
  'player-map068-self','map068-self','MAP068 Self','published',10,'#9d174d'
);

insert into public.map_entities (
  campaign_id,id,slug,entity_type,visibility,audience,name,summary,description,
  x,y,category_id,publication_status
) values
(
  '00000000-0000-4000-8000-000000000068',
  'entity-map068-self','map068-self','character','pin','public',
  'MAP068 Self','','',680,680,'category-map068-test','published'
),
(
  '00000000-0000-4000-8000-000000000068',
  'entity-map068-peer','map068-peer','location','pin','public',
  'MAP068 Peer','','',681,681,'category-map068-test','published'
);

select is(
  (select count(*) from public.entity_player_dispositions
   where entity_id='entity-map068-self' and player_id='player-map068-self'),
  1::bigint,
  'matrix exists before explicit identity'
);

update public.players
set character_entity_id='entity-map068-self'
where id='player-map068-self';

select is(
  (select count(*) from public.entity_player_dispositions
   where entity_id='entity-map068-self' and player_id='player-map068-self'),
  0::bigint,
  'linking identity removes self disposition'
);
select is(
  (select count(*) from public.entity_player_dispositions
   where entity_id='entity-map068-peer' and player_id='player-map068-self'),
  1::bigint,
  'non-self matrix remains'
);
select ok(
  pg_temp.statement_fails($sql$
    insert into public.entity_player_dispositions(campaign_id,entity_id,player_id,disposition)
    values(
      '00000000-0000-4000-8000-000000000068',
      'entity-map068-self','player-map068-self','ally'
    )
  $sql$),
  'raw self disposition is rejected'
);
select ok(
  pg_temp.statement_fails($sql$
    update public.players
    set character_entity_id='entity-aster-guide'
    where id='player-map068-self'
  $sql$),
  'identity cannot cross campaigns'
);
select ok(
  pg_temp.statement_fails($sql$
    insert into public.entity_player_associations(campaign_id,entity_id,player_id)
    values(
      '00000000-0000-4000-8000-000000000068',
      'entity-map068-peer','player-demo-one'
    )
  $sql$),
  'association cannot cross campaigns'
);
select ok(
  pg_temp.statement_fails($sql$
    insert into public.entity_player_dispositions(campaign_id,entity_id,player_id,disposition)
    values(
      '00000000-0000-4000-8000-000000000068',
      'entity-map068-peer','player-demo-one','neutral'
    )
  $sql$),
  'disposition cannot cross campaigns'
);
select ok(
  pg_temp.statement_fails($sql$
    insert into public.character_location_relations(
      campaign_id,character_id,location_id,relation_status,publication_status
    ) values(
      '00000000-0000-4000-8000-000000000068',
      'entity-map068-self','entity-bramble-fort','associated','draft'
    )
  $sql$),
  'generic relation cannot cross campaigns'
);
select is(
  (select count(*) from public.players
   where campaign_id='00000000-0000-4000-8000-000000000068'
     and id='player-map068-self'),
  1::bigint,
  'second campaign roster is independently queryable'
);

reset role;
set local role anon;
select is(
  (select count(*) from public.campaigns
   where slug in ('castigo-divino','un-aliento-menos')),
  2::bigint,
  'anon can select both active campaigns'
);

select * from finish();
rollback;
