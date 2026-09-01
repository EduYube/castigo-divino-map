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

create function pg_temp.statement_affected_rows(statement text)
returns bigint
language plpgsql
as $$
declare
  affected_rows bigint;
begin
  execute statement;
  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

select plan(41);

select is(
  (select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'map_entities' and column_name = 'audience'),
  '''public''::entity_audience',
  'audience defaults deterministically to public'
);

select is(
  (select is_nullable from information_schema.columns
   where table_schema = 'public' and table_name = 'map_entities' and column_name = 'audience'),
  'NO',
  'audience is not nullable'
);

-- Seed a complete private graph through the same authenticated/admin boundary used
-- by the browser. The transaction rolls back after all identities are exercised.
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

insert into public.map_entities (
  id, slug, entity_type, visibility, audience, name, summary, description,
  x, y, category_id, publication_status
)
select
  'entity-master-canary-character',
  'master-canary-character',
  'character',
  'pin',
  'master',
  'MAP044 MASTER CANARY CHARACTER',
  'Private character canary',
  'Never player-safe',
  321,
  654,
  category.id,
  'published'
from public.categories as category
where category.publication_status = 'published'
order by category.id
limit 1;

insert into public.map_entities (
  id, slug, entity_type, visibility, audience, name, summary, description,
  x, y, category_id, publication_status
)
select
  'place-master-canary-location',
  'master-canary-location',
  'location',
  'pin',
  'master',
  'MAP044 MASTER CANARY LOCATION',
  'Private location canary',
  'Never player-safe',
  322,
  655,
  category.id,
  'published'
from public.categories as category
where category.publication_status = 'published'
order by category.id
limit 1;

insert into public.entity_aliases (id, entity_id, language, value, publication_status)
values (
  'alias-master-canary',
  'entity-master-canary-character',
  'en',
  'MAP044 MASTER CANARY ALIAS',
  'published'
);

insert into public.entity_tags (id, entity_id, tag_id, publication_status)
select
  'entity-tag-master-canary',
  'entity-master-canary-character',
  tag.id,
  'published'
from public.tags as tag
where tag.publication_status = 'published'
order by tag.id
limit 1;

-- MAP-063 intentionally removes authenticated direct DML on public_notes. This
-- legacy MAP-044 fixture needs a synthetic note attached to a Master-only entity,
-- which the production creation RPC correctly rejects. Seed only that fixture as
-- the database owner, then immediately return to the authenticated admin boundary.
reset role;
insert into public.public_notes (
  id, slug, entity_id, title, body, sort_order, publication_status
)
values (
  'note-master-canary',
  'master-canary-note',
  'entity-master-canary-character',
  'MAP044 MASTER CANARY NOTE',
  'Never player-safe',
  944,
  'published'
);

insert into public.public_note_tags (id, note_id, tag_id, publication_status)
select
  'note-tag-master-canary',
  'note-master-canary',
  tag.id,
  'published'
from public.tags as tag
where tag.publication_status = 'published'
order by tag.id
limit 1;
set local role authenticated;

-- Geography is global after MAP-053. The global canary remains player-safe while
-- its campaign-specific link to a Master entity must stay hidden.
insert into public.geographic_names (
  id, slug, name, language, x, y, recommended_zoom, publication_status
)
values (
  'geo-master-canary',
  'global-canary-geography',
  'MAP044 GLOBAL CANARY GEOGRAPHY',
  'en',
  322,
  655,
  1,
  'published'
);

insert into public.geographic_name_aliases (
  id, geographic_name_id, language, value, publication_status
)
values (
  'geo-alias-master-canary',
  'geo-master-canary',
  'en',
  'MAP044 GLOBAL CANARY GEO ALIAS',
  'published'
);

insert into public.campaign_geographic_entity_links (
  campaign_id, geographic_name_id, entity_id
)
values (
  '00000000-0000-4000-8000-000000000053',
  'geo-master-canary',
  'place-master-canary-location'
);

insert into public.character_location_events (
  id, character_id, event_type, location_entity_id, location_label,
  summary, language, publication_status
)
values (
  'location-event-master-canary',
  'entity-master-canary-character',
  'sighting',
  'place-master-canary-location',
  'MAP044 MASTER CANARY EVENT',
  'Never player-safe',
  'en',
  'published'
);

insert into public.character_location_relations (
  character_id, location_id, relation_status, publication_status
)
values (
  'entity-master-canary-character',
  'place-master-canary-location',
  'associated',
  'published'
);

insert into public.character_location_relations (
  character_id, location_id, relation_status, publication_status
)
values (
  'entity-aster-guide',
  'entity-bramble-fort',
  'associated',
  'published'
)
on conflict do nothing;

select is(
  (select count(*) from public.map_entities where audience = 'master'),
  2::bigint,
  'admin sees the two private canary entities'
);
select is(
  (select count(*) from public.entity_aliases where id = 'alias-master-canary'),
  1::bigint,
  'admin sees private alias'
);
select is(
  (select count(*) from public.entity_player_dispositions where entity_id = 'entity-master-canary-character'),
  (select count(*) from public.players)::bigint,
  'admin sees private disposition matrix'
);
select is(
  (select count(*) from public.character_location_relations
   where character_id = 'entity-master-canary-character'),
  1::bigint,
  'admin sees private relation'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_get_map_entity_editor_v2(text)', 'execute'),
  'authenticated role can invoke the RLS-protected v2 admin read'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_save_map_entity_v2(text,timestamptz,text,text,entity_type,map_visibility,entity_audience,text,text,text,double precision,double precision,text,publication_status,text[],jsonb)',
    'execute'
  ),
  'authenticated role can invoke the RLS-protected v2 admin save'
);

reset role;
set local role anon;

select is(
  (select count(*) from public.map_entities
   where id in ('entity-master-canary-character', 'place-master-canary-location')),
  0::bigint,
  'anon cannot receive master entities'
);
select is((select count(*) from public.entity_aliases where id = 'alias-master-canary'), 0::bigint, 'anon cannot receive master aliases');
select is((select count(*) from public.entity_tags where id = 'entity-tag-master-canary'), 0::bigint, 'anon cannot receive master tag links');
select is((select count(*) from public.public_notes where id = 'note-master-canary'), 0::bigint, 'anon cannot receive master notes');
select is((select count(*) from public.public_note_tags where id = 'note-tag-master-canary'), 0::bigint, 'anon cannot receive master note tags');
select is((select count(*) from public.entity_player_dispositions where entity_id = 'entity-master-canary-character'), 0::bigint, 'anon cannot infer master entities from dispositions');
select is((select count(*) from public.geographic_names where id = 'geo-master-canary'), 1::bigint, 'anon retains the global geographic index');
select is((select count(*) from public.geographic_name_aliases where id = 'geo-alias-master-canary'), 1::bigint, 'anon retains global geographic aliases');
select is((select count(*) from public.campaign_geographic_entity_links where geographic_name_id = 'geo-master-canary'), 0::bigint, 'anon cannot infer a master entity through a geographic association');
select is((select count(*) from public.character_location_events where id = 'location-event-master-canary'), 0::bigint, 'anon cannot receive an event whose endpoints are master');
select is((select count(*) from public.character_location_relations where character_id = 'entity-master-canary-character'), 0::bigint, 'anon cannot receive a relation whose endpoints are master');
select ok(
  not has_function_privilege('anon', 'public.admin_get_map_entity_editor_v2(text)', 'execute'),
  'anon cannot execute the v2 admin read'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.admin_save_map_entity_v2(text,timestamptz,text,text,entity_type,map_visibility,entity_audience,text,text,text,double precision,double precision,text,publication_status,text[],jsonb)',
    'execute'
  ),
  'anon cannot execute the v2 admin save'
);
select ok(
  pg_temp.statement_fails(
    $$select public.submit_public_request(
      'Visitor', 'Manipulated master request', 'location', 100, 100,
      'Must never gain a private audience.', 'Manipulated call.', '', 'master'
    )$$
  ),
  'public request RPC has no audience parameter and cannot request master content'
);

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select is((select private.is_admin()), false, 'non-admin fixture remains non-admin');
select is(
  (select count(*) from public.map_entities
   where id in ('entity-master-canary-character', 'place-master-canary-location')),
  0::bigint,
  'authenticated non-admin cannot receive master entities'
);
select is((select count(*) from public.entity_aliases where id = 'alias-master-canary'), 0::bigint, 'authenticated non-admin cannot receive master aliases');
select is((select count(*) from public.entity_tags where id = 'entity-tag-master-canary'), 0::bigint, 'authenticated non-admin cannot receive master tag links');
select is((select count(*) from public.public_notes where id = 'note-master-canary'), 0::bigint, 'authenticated non-admin cannot receive master notes');
select is((select count(*) from public.public_note_tags where id = 'note-tag-master-canary'), 0::bigint, 'authenticated non-admin cannot receive master note tags');
select is((select count(*) from public.entity_player_dispositions where entity_id = 'entity-master-canary-character'), 0::bigint, 'authenticated non-admin cannot infer master entities from dispositions');
select is((select count(*) from public.geographic_names where id = 'geo-master-canary'), 1::bigint, 'authenticated non-admin retains the global geographic index');
select is((select count(*) from public.geographic_name_aliases where id = 'geo-alias-master-canary'), 1::bigint, 'authenticated non-admin retains global geographic aliases');
select is((select count(*) from public.campaign_geographic_entity_links where geographic_name_id = 'geo-master-canary'), 0::bigint, 'authenticated non-admin cannot infer a master geographic association');
select is((select count(*) from public.character_location_events where id = 'location-event-master-canary'), 0::bigint, 'authenticated non-admin cannot receive an event whose endpoints are master');
select is((select count(*) from public.character_location_relations where character_id = 'entity-master-canary-character'), 0::bigint, 'authenticated non-admin cannot receive a relation whose endpoints are master');
select is(
  (select count(*) from public.character_location_relations
   where character_id = 'entity-aster-guide'
     and location_id = 'entity-bramble-fort'),
  1::bigint,
  'authenticated non-admin retains access to published public relations'
);
select is(
  pg_temp.statement_affected_rows(
    $$update public.map_entities set audience = 'public'
      where id = 'entity-master-canary-character'$$
  ),
  0::bigint,
  'authenticated non-admin cannot change master audience'
);
select ok(
  pg_temp.statement_fails(
    $$select public.admin_get_map_entity_editor_v2('entity-master-canary-character')$$
  ),
  'authenticated non-admin cannot use the administrative audience read'
);

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select is(
  (public.admin_get_map_entity_editor_v2('entity-master-canary-character') -> 'record' ->> 'audience'),
  'master',
  'authorized admin editor contract returns master audience'
);

update public.map_entities
set audience = 'public'
where id = 'entity-master-canary-character';

reset role;
set local role anon;
select is(
  (select count(*) from public.map_entities where id = 'entity-master-canary-character'),
  1::bigint,
  'master to public transition becomes player-visible under the existing publication rules'
);
select is(
  (select count(*) from public.entity_aliases where id = 'alias-master-canary'),
  1::bigint,
  'dependent public projection follows the audience transition immediately'
);

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
update public.map_entities
set audience = 'master'
where id = 'entity-master-canary-character';

reset role;
set local role anon;
select is(
  (select count(*) from public.map_entities where id = 'entity-master-canary-character'),
  0::bigint,
  'public to master transition disappears from the public projection immediately'
);

select * from finish();
rollback;
