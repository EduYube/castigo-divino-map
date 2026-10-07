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

select plan(16);

select is(
  (
    select count(*)
    from public.campaigns
    where id = '00000000-0000-4000-8000-000000000068'::uuid
      and slug = 'un-aliento-menos'
      and name = 'Un aliento menos'
  ),
  1::bigint,
  'second campaign exists exactly once'
);

select has_column(
  'public',
  'players',
  'character_entity_id',
  'players expose an explicit backend player-character identity'
);

select fk_ok(
  'public',
  'players',
  'players_character_entity_campaign_fk',
  'public',
  'map_entities',
  'player identity is campaign-bound'
);

select ok(
  not has_column_privilege('anon', 'public.players', 'character_entity_id', 'SELECT'),
  'anon cannot read backend player-character identity'
);

select ok(
  not has_column_privilege('authenticated', 'public.players', 'character_entity_id', 'SELECT'),
  'authenticated clients cannot read backend player-character identity directly'
);

insert into public.categories (
  campaign_id,
  id,
  slug,
  name,
  description,
  publication_status
)
values
(
  '00000000-0000-4000-8000-000000000053',
  'category-map068-a',
  'map068-a',
  'MAP068 A',
  'MAP068 A',
  'published'
),
(
  '00000000-0000-4000-8000-000000000068',
  'category-map068-b',
  'map068-b',
  'MAP068 B',
  'MAP068 B',
  'published'
);

insert into public.players (
  campaign_id,
  id,
  slug,
  display_name,
  publication_status,
  display_order,
  accent_color
)
values
(
  '00000000-0000-4000-8000-000000000053',
  'player-map068-a',
  'map068-a',
  'MAP068 A',
  'published',
  10,
  '#1e3a8a'
),
(
  '00000000-0000-4000-8000-000000000068',
  'player-map068-self',
  'map068-self',
  'MAP068 Self',
  'published',
  10,
  '#9d174d'
);

insert into public.map_entities (
  campaign_id,
  id,
  slug,
  entity_type,
  visibility,
  audience,
  name,
  summary,
  description,
  x,
  y,
  category_id,
  publication_status
)
values
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map068-a-character',
  'map068-a-character',
  'character',
  'pin',
  'public',
  'MAP068 A Character',
  '',
  '',
  670,
  670,
  'category-map068-a',
  'published'
),
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map068-a-location',
  'map068-a-location',
  'location',
  'pin',
  'public',
  'MAP068 A Location',
  '',
  '',
  671,
  671,
  'category-map068-a',
  'published'
),
(
  '00000000-0000-4000-8000-000000000068',
  'entity-map068-self',
  'map068-self',
  'character',
  'pin',
  'public',
  'MAP068 Self',
  '',
  '',
  680,
  680,
  'category-map068-b',
  'published'
),
(
  '00000000-0000-4000-8000-000000000068',
  'entity-map068-peer',
  'map068-peer',
  'location',
  'pin',
  'public',
  'MAP068 Peer',
  '',
  '',
  681,
  681,
  'category-map068-b',
  'published'
);

select is(
  (
    select count(*)
    from public.entity_player_dispositions
    where entity_id = 'entity-map068-self'
      and player_id = 'player-map068-self'
  ),
  1::bigint,
  'matrix initially contains the pair before explicit identity is linked'
);

update public.players
set character_entity_id = 'entity-map068-self'
where id = 'player-map068-self';

select is(
  (
    select count(*)
    from public.entity_player_dispositions
    where entity_id = 'entity-map068-self'
      and player_id = 'player-map068-self'
  ),
  0::bigint,
  'linking identity removes the pre-existing self disposition'
);

select is(
  (
    select count(*)
    from public.entity_player_dispositions
    where entity_id = 'entity-map068-peer'
      and player_id = 'player-map068-self'
  ),
  1::bigint,
  'non-self disposition matrix remains intact'
);

select ok(
  pg_temp.statement_fails($sql$
    insert into public.entity_player_dispositions (
      campaign_id,
      entity_id,
      player_id,
      disposition
    )
    values (
      '00000000-0000-4000-8000-000000000068',
      'entity-map068-self',
      'player-map068-self',
      'ally'
    )
  $sql$),
  'structural trigger rejects a raw self disposition'
);

select ok(
  pg_temp.statement_fails($sql$
    update public.players
    set character_entity_id = 'entity-map068-a-character'
    where id = 'player-map068-self'
  $sql$),
  'player-character identity cannot cross campaigns'
);

select ok(
  pg_temp.statement_fails($sql$
    insert into public.entity_player_associations (
      campaign_id,
      entity_id,
      player_id
    )
    values (
      '00000000-0000-4000-8000-000000000068',
      'entity-map068-peer',
      'player-map068-a'
    )
  $sql$),
  'association cannot cross campaigns'
);

select ok(
  pg_temp.statement_fails($sql$
    insert into public.entity_player_dispositions (
      campaign_id,
      entity_id,
      player_id,
      disposition
    )
    values (
      '00000000-0000-4000-8000-000000000068',
      'entity-map068-peer',
      'player-map068-a',
      'neutral'
    )
  $sql$),
  'disposition cannot cross campaigns'
);

select ok(
  pg_temp.statement_fails($sql$
    insert into public.character_location_relations (
      campaign_id,
      character_id,
      location_id,
      relation_status,
      publication_status
    )
    values (
      '00000000-0000-4000-8000-000000000068',
      'entity-map068-self',
      'entity-map068-a-location',
      'associated',
      'draft'
    )
  $sql$),
  'generic character-location relation cannot cross campaigns'
);

insert into auth.users (id)
values ('00000000-0000-4000-8000-000000000099'::uuid)
on conflict (id) do nothing;

alter table public.public_requests disable trigger "20_validate_public_request";

select ok(
  pg_temp.statement_fails($sql$
    insert into public.public_requests (
      id,
      campaign_id,
      sender_name,
      proposed_name,
      entity_type,
      x,
      y,
      description,
      reason,
      request_status,
      moderator_user_id,
      converted_entity_id,
      moderated_at
    )
    values (
      '00000000-0000-4000-8000-000000000068'::uuid,
      '00000000-0000-4000-8000-000000000053',
      'MAP068 Request',
      'MAP068 Request',
      'character',
      690,
      690,
      'MAP068 cross-campaign conversion probe',
      'MAP068 campaign integrity',
      'converted',
      '00000000-0000-4000-8000-000000000099'::uuid,
      'entity-map068-self',
      pg_catalog.now()
    )
  $sql$),
  'converted request cannot reference an entity from another campaign'
);

alter table public.public_requests enable trigger "20_validate_public_request";

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000099';
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}';
set local role authenticated;

select ok(
  pg_temp.statement_fails($sql$
    update public.players
    set character_entity_id = 'entity-map068-peer'
    where id = 'player-map068-self'
  $sql$),
  'authenticated non-admin cannot mutate backend player-character identity'
);

reset role;
set local role anon;

select is(
  (
    select count(*)
    from public.campaigns
    where slug in ('castigo-divino', 'un-aliento-menos')
  ),
  2::bigint,
  'anon can select both active campaigns'
);

select * from finish();
rollback;
