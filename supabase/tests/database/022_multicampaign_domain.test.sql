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

select plan(35);

select is(
  (select id from public.campaigns where slug = 'castigo-divino'),
  '00000000-0000-4000-8000-000000000053'::uuid,
  'the v1.0 campaign has a deterministic stable id'
);
select is(
  (select count(*) from public.categories where campaign_id <> '00000000-0000-4000-8000-000000000053'::uuid),
  0::bigint,
  'seeded categories default to the initial campaign'
);
select is(
  (select count(*) from public.map_entities where campaign_id <> '00000000-0000-4000-8000-000000000053'::uuid),
  0::bigint,
  'seeded entities default to the initial campaign'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'geographic_names' and column_name = 'campaign_id'
  ),
  'the base geographic index remains global'
);
select is(
  (select count(*) from public.geographic_names where entity_id is not null),
  0::bigint,
  'legacy campaign-specific geographic links cannot remain on the global index'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

insert into public.campaigns (id, slug, name, status, display_order)
values ('00000000-0000-4000-8000-000000000054', 'map053-campaign-b', 'MAP053 Campaign B', 'active', 10);

insert into public.categories (campaign_id, id, slug, name, description, publication_status)
values (
  '00000000-0000-4000-8000-000000000054',
  'category-map053-b',
  'map053-b',
  'MAP053 B category',
  'Campaign B only',
  'published'
);

insert into public.tags (campaign_id, id, name, description, publication_status)
values (
  '00000000-0000-4000-8000-000000000054',
  'tag-map053-b',
  'MAP053 B tag',
  'Campaign B only',
  'published'
);

insert into public.players (campaign_id, id, slug, display_name, publication_status)
values (
  '00000000-0000-4000-8000-000000000054',
  'player-map053-b',
  'player-map053-b',
  'MAP053 B player',
  'published'
);

insert into public.map_entities (
  campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
  x, y, category_id, publication_status
) values
(
  '00000000-0000-4000-8000-000000000054',
  'entity-map053-b-character', 'map053-b-character', 'character', 'pin', 'public',
  'MAP053 B public character', 'Public B', 'Public B', 501, 501, 'category-map053-b', 'published'
),
(
  '00000000-0000-4000-8000-000000000054',
  'entity-map053-b-location', 'map053-b-location', 'location', 'pin', 'public',
  'MAP053 B public location', 'Public B', 'Public B', 502, 502, 'category-map053-b', 'published'
),
(
  '00000000-0000-4000-8000-000000000054',
  'entity-map053-b-master', 'map053-b-master', 'location', 'pin', 'master',
  'MAP053 B MASTER CANARY', 'Private B', 'Never public', 503, 503, 'category-map053-b', 'published'
);

select is(
  (select count(*) from public.entity_player_dispositions
   where player_id = 'player-map053-b' and campaign_id = '00000000-0000-4000-8000-000000000054'::uuid),
  3::bigint,
  'the automatic disposition matrix contains campaign B entities'
);
select is(
  (select count(*) from public.entity_player_dispositions
   where player_id = 'player-map053-b' and campaign_id = '00000000-0000-4000-8000-000000000053'::uuid),
  0::bigint,
  'the automatic disposition matrix never crosses campaigns'
);

select ok(
  pg_temp.statement_fails($sql$
    insert into public.map_entities (
      campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
      x, y, category_id, publication_status
    ) values (
      '00000000-0000-4000-8000-000000000054', 'entity-map053-b-bad-category',
      'map053-b-bad-category', 'location', 'pin', 'public', 'Bad category', '', '', 510, 510,
      'category-settlement', 'draft'
    )
  $sql$),
  'an entity cannot use a category from another campaign'
);
select ok(
  pg_temp.statement_fails($sql$
    insert into public.entity_aliases (campaign_id, id, entity_id, language, value, publication_status)
    values (
      '00000000-0000-4000-8000-000000000054', 'alias-map053-cross',
      'entity-aster-guide', 'en', 'MAP053 cross alias', 'draft'
    )
  $sql$),
  'an alias cannot target an entity from another campaign'
);
select ok(
  pg_temp.statement_fails($sql$
    insert into public.entity_tags (campaign_id, id, entity_id, tag_id, publication_status)
    values (
      '00000000-0000-4000-8000-000000000054', 'entity-tag-map053-cross',
      'entity-map053-b-character', 'tag-featured', 'draft'
    )
  $sql$),
  'an entity tag cannot join campaign B to a campaign A tag'
);
select ok(
  pg_temp.statement_fails($sql$
    insert into public.public_notes (campaign_id, id, slug, entity_id, title, body, sort_order, publication_status)
    values (
      '00000000-0000-4000-8000-000000000054', 'note-map053-cross', 'map053-cross-note',
      'entity-aster-guide', 'Cross note', 'Forbidden', 1, 'draft'
    )
  $sql$),
  'a note cannot target an entity from another campaign'
);
select ok(
  pg_temp.statement_fails($sql$
    insert into public.character_location_relations (
      campaign_id, character_id, location_id, relation_status, publication_status
    ) values (
      '00000000-0000-4000-8000-000000000054',
      'entity-map053-b-character', 'entity-bramble-fort', 'associated', 'draft'
    )
  $sql$),
  'a character-location relation cannot cross campaigns'
);
select ok(
  pg_temp.statement_fails($sql$
    insert into public.character_location_events (
      campaign_id, id, character_id, event_type, location_entity_id,
      location_label, summary, language, publication_status
    ) values (
      '00000000-0000-4000-8000-000000000054', 'event-map053-cross',
      'entity-map053-b-character', 'sighting', 'entity-bramble-fort',
      'Cross event', 'Forbidden', 'en', 'draft'
    )
  $sql$),
  'a campaign event cannot target a location from another campaign'
);
select ok(
  pg_temp.statement_fails($sql$
    update public.map_entities
    set campaign_id = '00000000-0000-4000-8000-000000000053'
    where id = 'entity-map053-b-character'
  $sql$),
  'an existing entity cannot be moved between campaigns'
);

insert into public.geographic_names (
  id, slug, name, language, x, y, recommended_zoom, publication_status
) values (
  'geo-map053-global', 'map053-global-place', 'MAP053 GLOBAL PLACE', 'en', 503, 503, 1, 'published'
);

insert into public.campaign_geographic_entity_links (campaign_id, geographic_name_id, entity_id)
values (
  '00000000-0000-4000-8000-000000000054',
  'geo-map053-global',
  'entity-map053-b-master'
);

select is(
  (select count(*) from public.geographic_names where id = 'geo-map053-global'),
  1::bigint,
  'admin sees one shared global geographic record'
);
select is(
  (select count(*) from public.campaign_geographic_entity_links where geographic_name_id = 'geo-map053-global'),
  1::bigint,
  'the campaign-specific geographic entity association is stored separately'
);

reset role;
set local role anon;

select is(
  (select count(*) from public.campaigns where id in (
    '00000000-0000-4000-8000-000000000053'::uuid,
    '00000000-0000-4000-8000-000000000054'::uuid
  )),
  2::bigint,
  'anon can enumerate both active public campaigns'
);
select is(
  (select count(*) from public.map_entities where id = 'entity-map053-b-character'),
  1::bigint,
  'anon can read public campaign B content'
);
select is(
  (select count(*) from public.map_entities where id = 'entity-map053-b-master'),
  0::bigint,
  'anon cannot read campaign B master content'
);
select is(
  (select count(*) from public.geographic_names where id = 'geo-map053-global'),
  1::bigint,
  'anon receives the universal geographic name even when a campaign master pin references it'
);
select is(
  (select count(*) from public.campaign_geographic_entity_links where geographic_name_id = 'geo-map053-global'),
  0::bigint,
  'anon cannot infer a master pin through the campaign geographic association'
);
select ok(
  has_function_privilege(
    'anon',
    'public.submit_public_request_v2(uuid,text,text,entity_type,double precision,double precision,text,text,text)',
    'execute'
  ),
  'anon can use campaign-aware public request ingress'
);
select ok(
  public.submit_public_request_v2(
    '00000000-0000-4000-8000-000000000054',
    'MAP053 Visitor', 'MAP053 proposed B', 'location', 550, 550,
    'Campaign B proposal', 'MAP053 isolation test', ''
  ),
  'anon can submit a request to an active campaign'
);

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select is((select private.is_admin()), false, 'authenticated reader fixture is not an admin');
select is(
  (select count(*) from public.map_entities where id = 'entity-map053-b-master'),
  0::bigint,
  'authenticated non-admin cannot read campaign B master content'
);
select is(
  (select count(*) from public.campaign_geographic_entity_links where geographic_name_id = 'geo-map053-global'),
  0::bigint,
  'authenticated non-admin cannot infer the master geographic link'
);
select is(
  (select count(*) from public.geographic_names where id = 'geo-map053-global'),
  1::bigint,
  'authenticated non-admin retains the universal geographic index'
);
select ok(
  pg_temp.statement_fails($sql$
    insert into public.campaigns (id, slug, name)
    values ('00000000-0000-4000-8000-000000000055', 'map053-reader-write', 'Forbidden')
  $sql$),
  'authenticated non-admin cannot create campaigns'
);

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select is((select private.is_admin()), true, 'admin fixture remains authorized across campaigns');
select is(
  (select campaign_id from public.public_requests where proposed_name = 'MAP053 proposed B'),
  '00000000-0000-4000-8000-000000000054'::uuid,
  'campaign-aware request ingress persists the chosen scope'
);

select is(
  (
    select (
      public.admin_moderate_public_request(
        request.id,
        request.updated_at,
        'convert',
        'MAP053 conversion'
      ) ->> 'draft_entity_id'
    )
    from public.public_requests request
    where request.proposed_name = 'MAP053 proposed B'
  ),
  (
    select converted_entity_id
    from public.public_requests
    where proposed_name = 'MAP053 proposed B'
  ),
  'admin moderation converts the campaign B request atomically'
);
select is(
  (
    select entity.campaign_id
    from public.map_entities entity
    join public.public_requests request on request.converted_entity_id = entity.id
    where request.proposed_name = 'MAP053 proposed B'
  ),
  '00000000-0000-4000-8000-000000000054'::uuid,
  'converted entities inherit the request campaign'
);
select is(
  (select count(*) from public.map_entities where id = 'entity-map053-b-master'),
  1::bigint,
  'admin can manage master content in campaign B'
);

update public.campaigns
set status = 'archived', archived_at = now()
where id = '00000000-0000-4000-8000-000000000054';

reset role;
set local role anon;
select is(
  (select count(*) from public.campaigns where id = '00000000-0000-4000-8000-000000000054'),
  0::bigint,
  'archived campaigns disappear from public campaign discovery'
);
select is(
  (select count(*) from public.map_entities where id = 'entity-map053-b-character'),
  0::bigint,
  'archived campaign content disappears from public projection'
);
select ok(
  pg_temp.statement_fails($sql$
    select public.submit_public_request_v2(
      '00000000-0000-4000-8000-000000000054',
      'MAP053 Visitor', 'Archived target', 'location', 560, 560,
      'Must be rejected', 'Archived campaign', ''
    )
  $sql$),
  'public request ingress rejects archived campaigns'
);

select * from finish();
rollback;
