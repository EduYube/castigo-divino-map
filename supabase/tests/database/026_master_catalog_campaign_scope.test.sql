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

select plan(10);

select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_get_master_catalog_v3(uuid)',
    'execute'
  ),
  'authenticated role may invoke the campaign-scoped Master catalog RPC'
);

select ok(
  not has_function_privilege('anon', 'public.admin_get_master_catalog_v3(uuid)', 'execute'),
  'anon cannot execute the campaign-scoped Master catalog RPC'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select ok(
  pg_temp.statement_fails($sql$
    select public.admin_get_master_catalog_v3(
      '00000000-0000-4000-8000-000000000053'::uuid
    )
  $sql$),
  'authenticated non-admin cannot read private campaign content'
);

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

insert into public.campaigns (id, slug, name, status, display_order)
values (
  '00000000-0000-4000-8000-000000000055',
  'map055-campaign-b',
  'MAP055 Campaign B',
  'active',
  55
);

insert into public.categories (
  campaign_id, id, slug, name, description, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'category-map055-a', 'map055-a', 'MAP055 A CATEGORY CANARY', 'A only', 'published'
),
(
  '00000000-0000-4000-8000-000000000055',
  'category-map055-b', 'map055-b', 'MAP055 B CATEGORY CANARY', 'B only', 'published'
);

insert into public.tags (campaign_id, id, name, description, publication_status)
values
(
  '00000000-0000-4000-8000-000000000053',
  'tag-map055-a', 'MAP055 A TAG CANARY', 'A only', 'published'
),
(
  '00000000-0000-4000-8000-000000000055',
  'tag-map055-b', 'MAP055 B TAG CANARY', 'B only', 'published'
);

insert into public.players (
  campaign_id, id, slug, display_name, publication_status, display_order, accent_color
) values
(
  '00000000-0000-4000-8000-000000000053',
  'player-map055-a', 'map055-a', 'MAP055 A PLAYER CANARY', 'published', 55, '#334155'
),
(
  '00000000-0000-4000-8000-000000000055',
  'player-map055-b', 'map055-b', 'MAP055 B PLAYER CANARY', 'published', 55, '#334155'
);

insert into public.map_entities (
  campaign_id, id, slug, entity_type, visibility, audience, name, summary, description,
  x, y, category_id, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'entity-map055-master-a', 'map055-master-a', 'location', 'pin', 'master',
  'MAP055 A MASTER CANARY', 'Private A', 'Must never enter B',
  701, 701, 'category-map055-a', 'published'
),
(
  '00000000-0000-4000-8000-000000000055',
  'entity-map055-master-b', 'map055-master-b', 'location', 'pin', 'master',
  'MAP055 B MASTER CANARY', 'Private B', 'Must never enter A',
  702, 702, 'category-map055-b', 'published'
);

insert into public.entity_aliases (
  campaign_id, id, entity_id, language, value, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'alias-map055-a', 'entity-map055-master-a', 'en', 'MAP055 A ALIAS CANARY', 'published'
),
(
  '00000000-0000-4000-8000-000000000055',
  'alias-map055-b', 'entity-map055-master-b', 'en', 'MAP055 B ALIAS CANARY', 'published'
);

insert into public.entity_tags (
  campaign_id, id, entity_id, tag_id, publication_status
) values
(
  '00000000-0000-4000-8000-000000000053',
  'entity-tag-map055-a', 'entity-map055-master-a', 'tag-map055-a', 'published'
),
(
  '00000000-0000-4000-8000-000000000055',
  'entity-tag-map055-b', 'entity-map055-master-b', 'tag-map055-b', 'published'
);

select ok(
  position(
    'MAP055 A MASTER CANARY'
    in public.admin_get_master_catalog_v3(
      '00000000-0000-4000-8000-000000000053'::uuid
    )::text
  ) > 0,
  'campaign A private catalog contains its own Master canary'
);

select ok(
  position(
    'MAP055 B MASTER CANARY'
    in public.admin_get_master_catalog_v3(
      '00000000-0000-4000-8000-000000000053'::uuid
    )::text
  ) = 0,
  'campaign A private catalog excludes the campaign B Master canary'
);

select ok(
  position(
    'MAP055 B MASTER CANARY'
    in public.admin_get_master_catalog_v3(
      '00000000-0000-4000-8000-000000000055'::uuid
    )::text
  ) > 0,
  'campaign B private catalog contains its own Master canary'
);

select ok(
  position(
    'MAP055 A MASTER CANARY'
    in public.admin_get_master_catalog_v3(
      '00000000-0000-4000-8000-000000000055'::uuid
    )::text
  ) = 0,
  'campaign B private catalog excludes the campaign A Master canary'
);

select ok(
  position(
    'MAP055 A CATEGORY CANARY'
    in public.admin_get_master_catalog_v3(
      '00000000-0000-4000-8000-000000000055'::uuid
    )::text
  ) = 0
  and position(
    'MAP055 A TAG CANARY'
    in public.admin_get_master_catalog_v3(
      '00000000-0000-4000-8000-000000000055'::uuid
    )::text
  ) = 0
  and position(
    'MAP055 A ALIAS CANARY'
    in public.admin_get_master_catalog_v3(
      '00000000-0000-4000-8000-000000000055'::uuid
    )::text
  ) = 0
  and position(
    'MAP055 A PLAYER CANARY'
    in public.admin_get_master_catalog_v3(
      '00000000-0000-4000-8000-000000000055'::uuid
    )::text
  ) = 0,
  'campaign B catalog excludes campaign A private facets and player data'
);

select is(
  pg_catalog.jsonb_typeof(
    public.admin_get_master_catalog_v3('00000000-0000-4000-8000-000000000053'::uuid)
  ),
  'object',
  'authorized admin can read the initial active campaign through v3'
);

update public.campaigns
set status = 'archived'
where id = '00000000-0000-4000-8000-000000000055'::uuid;

select ok(
  pg_temp.statement_fails($sql$
    select public.admin_get_master_catalog_v3(
      '00000000-0000-4000-8000-000000000055'::uuid
    )
  $sql$),
  'campaign-scoped Master RPC rejects archived campaigns fail-closed'
);

select ok(
  pg_temp.statement_fails($sql$
    select public.admin_get_master_catalog_v3(
      '00000000-0000-4000-8000-000000000099'::uuid
    )
  $sql$),
  'campaign-scoped Master RPC rejects nonexistent campaigns fail-closed'
);

select * from finish();
rollback;
