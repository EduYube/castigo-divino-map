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

select plan(25);

select has_column('public', 'players', 'display_order', 'players expose a persistent roster order');
select has_column('public', 'players', 'accent_color', 'players expose a persistent accent color');
select ok(
  private.player_accent_contrast_on_white('#c2410c') >= 3
  and private.player_accent_contrast_on_white('#1e3a8a') >= 3
  and private.player_accent_contrast_on_white('#9d174d') >= 3,
  'required initial roster accents satisfy the backend contrast threshold'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select is((select private.is_admin()), true, 'admin fixture is authorized for MAP-054');

select lives_ok(
  $$insert into public.campaigns (id, slug, name, status, display_order)
    values ('00000000-0000-4000-8000-000000000540', 'map054-campaign-b', 'MAP054 Campaign B', 'active', 20)$$,
  'admin can create a second campaign'
);

insert into public.categories (campaign_id, id, slug, name, description, publication_status)
values (
  '00000000-0000-4000-8000-000000000540',
  'category-map054-b',
  'map054-b',
  'MAP054 B category',
  'Campaign B only',
  'published'
);

select lives_ok(
  $$insert into public.players (
      campaign_id, id, slug, display_name, publication_status, display_order, accent_color
    ) values (
      '00000000-0000-4000-8000-000000000053',
      'player-map054-a', 'map054-a', 'MAP054 Player A', 'published', 10, '#c2410c'
    )$$,
  'admin can create a player in the initial campaign'
);

select lives_ok(
  $$insert into public.players (
      campaign_id, id, slug, display_name, publication_status, display_order, accent_color
    ) values (
      '00000000-0000-4000-8000-000000000540',
      'player-map054-b', 'map054-b', 'MAP054 Player B', 'published', 5, '#1E3A8A'
    )$$,
  'admin can create a distinct player in campaign B'
);

select is(
  (select count(*) from public.players where id = 'player-map054-a'
    and campaign_id = '00000000-0000-4000-8000-000000000053'),
  1::bigint,
  'campaign A roster contains only its new player identity'
);
select is(
  (select count(*) from public.players where id = 'player-map054-b'
    and campaign_id = '00000000-0000-4000-8000-000000000540'),
  1::bigint,
  'campaign B roster contains only its new player identity'
);
select is(
  (select accent_color from public.players where id = 'player-map054-b'),
  '#1e3a8a'::text,
  'accent colors are normalized and persisted as data'
);

insert into public.map_entities (
  campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
  x, y, category_id, publication_status
) values (
  '00000000-0000-4000-8000-000000000540',
  'entity-map054-b', 'map054-b-entity', 'location', 'pin', 'public',
  'MAP054 Campaign B entity', '', '', 640, 640, 'category-map054-b', 'published'
);

select is(
  (select count(*) from public.entity_player_dispositions
    where entity_id = 'entity-map054-b'
      and player_id = 'player-map054-b'
      and campaign_id = '00000000-0000-4000-8000-000000000540'),
  1::bigint,
  'campaign B entity receives only its campaign B roster disposition'
);
select is(
  (select count(*) from public.entity_player_dispositions
    where entity_id = 'entity-map054-b' and player_id = 'player-map054-a'),
  0::bigint,
  'campaign A roster is never mixed into campaign B disposition selects'
);

select ok(
  pg_temp.statement_fails($sql$
    insert into public.players (
      campaign_id, id, slug, display_name, publication_status, accent_color
    ) values (
      '00000000-0000-4000-8000-000000000540',
      'player-map054-low-contrast', 'map054-low-contrast', 'Low contrast', 'draft', '#ffffff'
    )
  $sql$),
  'backend rejects a player accent below the contrast threshold'
);

update public.entity_player_dispositions
set disposition = 'ally'
where entity_id = 'entity-map054-b' and player_id = 'player-map054-b';
update public.players set publication_status = 'archived' where id = 'player-map054-b';

select is(
  (select disposition::text from public.entity_player_dispositions
    where entity_id = 'entity-map054-b' and player_id = 'player-map054-b'),
  'ally'::text,
  'archiving a player preserves historical dispositions'
);
select is(
  (select publication_status::text from public.players where id = 'player-map054-b'),
  'archived'::text,
  'player archival is non-destructive'
);

update public.players set publication_status = 'draft' where id = 'player-map054-b';
update public.players set publication_status = 'published' where id = 'player-map054-b';
select ok(
  exists (
    select 1 from public.players player
    join public.entity_player_dispositions relation on relation.player_id = player.id
    where player.id = 'player-map054-b'
      and player.publication_status = 'published'
      and relation.entity_id = 'entity-map054-b'
      and relation.disposition = 'ally'
  ),
  'restoring a player preserves its identity and historical relations'
);

update public.campaigns
set status = 'archived'
where id = '00000000-0000-4000-8000-000000000540';
select is(
  (select count(*) from public.players where id = 'player-map054-b'),
  1::bigint,
  'archiving a campaign preserves its roster'
);
select is(
  (select count(*) from public.map_entities where id = 'entity-map054-b'),
  1::bigint,
  'archiving a campaign preserves related campaign content'
);

update public.campaigns
set status = 'active', name = 'MAP054 Campaign B restored'
where id = '00000000-0000-4000-8000-000000000540';
select ok(
  exists (
    select 1 from public.campaigns
    where id = '00000000-0000-4000-8000-000000000540'
      and slug = 'map054-campaign-b'
      and name = 'MAP054 Campaign B restored'
      and status = 'active'
  ),
  'campaign restore keeps stable id and slug while allowing editable metadata'
);

select ok(
  pg_temp.statement_fails($sql$
    select public.admin_get_map_entity_editor_v4(
      '00000000-0000-4000-8000-000000000053',
      'entity-map054-b'
    )
  $sql$),
  'admin editor rejects an entity from a different selected campaign'
);
select is(
  public.admin_get_map_entity_editor_v4(
    '00000000-0000-4000-8000-000000000540',
    'entity-map054-b'
  ) -> 'record' ->> 'id',
  'entity-map054-b'::text,
  'admin editor accepts an entity from the selected campaign'
);

reset role;
select ok(
  pg_temp.statement_fails($sql$
    delete from public.campaigns where id = '00000000-0000-4000-8000-000000000540'
  $sql$),
  'storage prevents physical deletion of a campaign with related content'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select ok(
  pg_temp.statement_fails($sql$
    insert into public.campaigns (id, slug, name)
    values ('00000000-0000-4000-8000-000000000541', 'map054-forbidden', 'Forbidden')
  $sql$),
  'authenticated non-admin cannot create campaigns'
);
select ok(
  pg_temp.statement_fails($sql$
    insert into public.players (campaign_id, id, slug, display_name, publication_status)
    values (
      '00000000-0000-4000-8000-000000000053',
      'player-map054-forbidden', 'map054-forbidden', 'Forbidden', 'draft'
    )
  $sql$),
  'authenticated non-admin cannot create roster members'
);
select ok(
  pg_temp.statement_fails($sql$
    update public.players set display_name = 'Tampered' where id = 'player-map054-b'
  $sql$),
  'authenticated non-admin cannot edit another campaign roster'
);
select ok(
  pg_temp.statement_fails($sql$
    select public.admin_get_map_entity_editor_v4(
      '00000000-0000-4000-8000-000000000540',
      'entity-map054-b'
    )
  $sql$),
  'authenticated non-admin cannot invoke scoped administrative editor logic'
);

reset role;
set local role anon;
select ok(
  not has_function_privilege(
    'anon',
    'public.admin_get_map_entity_editor_v4(uuid,text)',
    'execute'
  ),
  'anon has no execute privilege on the campaign-scoped entity editor'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.admin_moderate_public_request_v2(uuid,uuid,timestamptz,text,text)',
    'execute'
  ),
  'anon has no execute privilege on campaign-scoped moderation'
);

select * from finish();
rollback;
