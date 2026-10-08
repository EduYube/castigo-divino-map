begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create function pg_temp.statement_fails_with_sqlstate(statement text, expected_state text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return false;
exception
  when others then
    return sqlstate = expected_state;
end;
$$;

select plan(14);

select ok(
  'organization' = any(enum_range(null::public.entity_type)::text[]),
  'MAP-069 adds organization to entity_type'
);

select has_table('public', 'entity_relations', 'MAP-069 adds generic entity relations');
select fk_ok(
  'public',
  'entity_relations',
  array['left_entity_id', 'campaign_id'],
  'public',
  'map_entities',
  array['id', 'campaign_id'],
  'left generic relation endpoint is campaign-bound'
);
select fk_ok(
  'public',
  'entity_relations',
  array['right_entity_id', 'campaign_id'],
  'public',
  'map_entities',
  array['id', 'campaign_id'],
  'right generic relation endpoint is campaign-bound'
);

insert into public.categories (
  campaign_id, id, slug, name, description, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'category-map069-a',
  'map069-a',
  'MAP069 A',
  '',
  'published'
),
(
  '00000000-0000-4000-8000-000000000068',
  'category-map069-b',
  'map069-b',
  'MAP069 B',
  '',
  'published'
);

insert into public.map_entities (
  campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
  x, y, category_id, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map069-org-public',
  'map069-org-public',
  'organization',
  'search_only',
  'public',
  'MAP069 Public Organization',
  '',
  '',
  null,
  null,
  'category-map069-a',
  'published'
),
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map069-org-master',
  'map069-org-master',
  'organization',
  'search_only',
  'master',
  'MAP069 Master Organization',
  '',
  '',
  null,
  null,
  'category-map069-a',
  'published'
),
(
  '00000000-0000-4000-8000-000000000053',
  'place-map069-hall-a',
  'map069-hall-a',
  'location',
  'pin',
  'public',
  'MAP069 Hall A',
  '',
  '',
  690,
  690,
  'category-map069-a',
  'published'
),
(
  '00000000-0000-4000-8000-000000000068',
  'place-map069-hall-b',
  'map069-hall-b',
  'location',
  'pin',
  'public',
  'MAP069 Hall B',
  '',
  '',
  691,
  691,
  'category-map069-b',
  'published'
);

select is(
  (
    select pg_catalog.jsonb_build_array(x, y, geometry)
    from public.map_entities
    where id = 'entity-map069-org-public'
  ),
  '[null,null,null]'::jsonb,
  'organization persists without x, y or geometry'
);

select ok(
  pg_temp.statement_fails_with_sqlstate($sql$
    insert into public.map_entities (
      campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
      x, y, category_id, publication_status
    ) values (
      '00000000-0000-4000-8000-000000000053',
      'entity-map069-org-invalid',
      'map069-org-invalid',
      'organization',
      'search_only',
      'public',
      'MAP069 Invalid Organization',
      '',
      '',
      0,
      null,
      'category-map069-a',
      'draft'
    )
  $sql$, '23514'),
  'organization cannot carry partial or sentinel coordinates'
);

select ok(
  pg_temp.statement_fails_with_sqlstate($sql$
    insert into public.map_entities (
      campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
      x, y, category_id, publication_status
    ) values (
      '00000000-0000-4000-8000-000000000053',
      'entity-map069-spatial-invalid',
      'map069-spatial-invalid',
      'character',
      'pin',
      'public',
      'MAP069 Invalid Spatial',
      '',
      '',
      null,
      null,
      'category-map069-a',
      'draft'
    )
  $sql$, '23514'),
  'existing spatial entity types still require valid spatial data'
);

insert into public.entity_relations (
  campaign_id, left_entity_id, right_entity_id, left_label, right_label
) values (
  '00000000-0000-4000-8000-000000000053',
  'entity-map069-org-public',
  'place-map069-hall-a',
  'Sede / localización relacionada',
  'Organización'
);

select is(
  (
    select count(*) from public.entity_relations
    where campaign_id = '00000000-0000-4000-8000-000000000053'
      and left_entity_id = 'entity-map069-org-public'
      and right_entity_id = 'place-map069-hall-a'
  ),
  1::bigint,
  'organization/location generic relation is stored once'
);

select ok(
  pg_temp.statement_fails_with_sqlstate($sql$
    insert into public.entity_relations (
      campaign_id, left_entity_id, right_entity_id, left_label, right_label
    ) values (
      '00000000-0000-4000-8000-000000000053',
      'place-map069-hall-a',
      'entity-map069-org-public',
      'Organización',
      'Sede'
    )
  $sql$, '23514'),
  'reverse duplicate ordering is rejected structurally'
);

select ok(
  pg_temp.statement_fails_with_sqlstate($sql$
    insert into public.entity_relations (
      campaign_id, left_entity_id, right_entity_id, left_label, right_label
    ) values (
      '00000000-0000-4000-8000-000000000053',
      'entity-map069-org-public',
      'place-map069-hall-b',
      'Sede',
      'Organización'
    )
  $sql$, '23503'),
  'generic entity relation cannot cross campaign boundaries'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select ok(
  (
    public.admin_get_map_entity_editor_v8(
      '00000000-0000-4000-8000-000000000053',
      'entity-map069-org-public'
    ) -> 'entity_relations'
  ) @> '[{"other_entity_id":"place-map069-hall-a","own_label":"Sede / localización relacionada","other_label":"Organización"}]'::jsonb,
  'admin editor renders the one stored relation from the organization endpoint'
);

select ok(
  (
    public.admin_get_map_entity_editor_v8(
      '00000000-0000-4000-8000-000000000053',
      'place-map069-hall-a'
    ) -> 'entity_relations'
  ) @> '[{"other_entity_id":"entity-map069-org-public","own_label":"Organización","other_label":"Sede / localización relacionada"}]'::jsonb,
  'admin editor renders the same stored relation from the building endpoint'
);

select ok(
  pg_temp.statement_fails_with_sqlstate($sql$
    insert into public.entity_player_dispositions (
      campaign_id, entity_id, player_id, disposition
    )
    select
      '00000000-0000-4000-8000-000000000053',
      'entity-map069-org-public',
      player.id,
      'ally'
    from public.players player
    where player.campaign_id = '00000000-0000-4000-8000-000000000053'
    limit 1
  $sql$, '23514'),
  'organization cannot participate in player dispositions'
);

reset role;
set local role anon;

select is(
  (select count(*) from public.map_entities where id = 'entity-map069-org-public'),
  1::bigint,
  'published public organization is visible to anon'
);
select is(
  (select count(*) from public.map_entities where id = 'entity-map069-org-master'),
  0::bigint,
  'Master organization remains hidden from anon'
);
select is(
  (select count(*) from public.entity_relations where left_entity_id = 'entity-map069-org-public'),
  1::bigint,
  'public generic relation is visible when both endpoints are public'
);

reset role;
select * from finish();
rollback;
