-- INFRA #210. This file is run AFTER a clean db reset by supabase:db:validate.
-- Full table and per-column allowlist came from the read-only 2026-10-21
-- production audit; regressions must be deliberate and reviewed.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

select is(current_user, 'postgres'::name,
  'probe objects are created by postgres, the owner whose defaults we hardened');

-- No public schema object may silently join the allowlist. Audit every
-- effective table right, not only ACL text (column grants are checked below).
with expected(name, anon_read, authenticated_read, authenticated_delete) as (
  values
    ('campaign_geographic_entity_links', true, true, true),
    ('campaigns', true, true, false),
    ('categories', true, true, true),
    ('character_location_events', true, true, true),
    ('character_location_relations', false, true, true),
    ('entity_aliases', true, true, true),
    ('entity_map_placements', true, true, true),
    ('entity_player_associations', false, false, true),
    ('entity_player_dispositions', true, true, false),
    ('entity_relations', false, false, true),
    ('entity_tags', true, true, true),
    ('geographic_name_aliases', true, true, true),
    ('geographic_names', true, true, true),
    ('map_contexts', true, true, true),
    ('map_entities', true, true, true),
    ('players', false, false, true),
    ('public_note_tags', true, true, true),
    ('public_notes', true, true, false),
    ('public_requests', false, true, true),
    ('tags', true, true, true)
), real as (
  select c.relname::text as name, c.oid, c.relrowsecurity
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p')
)
select is(
  (select count(*) from expected full join real using (name)
   where expected.name is null or real.name is null),
  0::bigint,
  'precisely the 20 expected public tables exist'
);

select is(
  (select count(*) from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p')
     and not c.relrowsecurity),
  0::bigint,
  'RLS is enabled for every exposed public table'
);

with expected(name, anon_read, authenticated_read, authenticated_delete) as (
  values
    ('campaign_geographic_entity_links', true, true, true),
    ('campaigns', true, true, false),
    ('categories', true, true, true),
    ('character_location_events', true, true, true),
    ('character_location_relations', false, true, true),
    ('entity_aliases', true, true, true),
    ('entity_map_placements', true, true, true),
    ('entity_player_associations', false, false, true),
    ('entity_player_dispositions', true, true, false),
    ('entity_relations', false, false, true),
    ('entity_tags', true, true, true),
    ('geographic_name_aliases', true, true, true),
    ('geographic_names', true, true, true),
    ('map_contexts', true, true, true),
    ('map_entities', true, true, true),
    ('players', false, false, true),
    ('public_note_tags', true, true, true),
    ('public_notes', true, true, false),
    ('public_requests', false, true, true),
    ('tags', true, true, true)
), real as (
  select c.relname::text as name, c.oid
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')
)
select is(
  (select count(*)
   from expected join real using (name)
   where pg_catalog.has_table_privilege('anon', real.oid, 'SELECT') <> expected.anon_read
      or pg_catalog.has_table_privilege('authenticated', real.oid, 'SELECT') <> expected.authenticated_read
      or pg_catalog.has_table_privilege('authenticated', real.oid, 'DELETE') <> expected.authenticated_delete
      or pg_catalog.has_table_privilege('anon', real.oid, 'INSERT')
      or pg_catalog.has_table_privilege('anon', real.oid, 'UPDATE')
      or pg_catalog.has_table_privilege('anon', real.oid, 'DELETE')
      or pg_catalog.has_table_privilege('authenticated', real.oid, 'INSERT')
      or pg_catalog.has_table_privilege('authenticated', real.oid, 'UPDATE')
      or pg_catalog.has_table_privilege('service_role', real.oid, 'SELECT')
      or pg_catalog.has_table_privilege('service_role', real.oid, 'INSERT')
      or pg_catalog.has_table_privilege('service_role', real.oid, 'UPDATE')
      or pg_catalog.has_table_privilege('service_role', real.oid, 'DELETE')),
  0::bigint,
  'table-level CRUD grants match the least-privilege role matrix exactly'
);

select is(
  (select count(*)
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   cross join lateral pg_catalog.aclexplode(
     coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))
   ) grant_item
   where n.nspname='public' and c.relkind in ('r','p')
     and grant_item.grantee=0),
  0::bigint,
  'PUBLIC pseudo-role has no direct table ACL'
);

-- Reconstitute the column-specific administrative API. Full table INSERT /
-- UPDATE is intentionally absent: auth admins may change only these fields.
with expected(name, ins, upd) as (
  values
    ('campaign_geographic_entity_links', 'campaign_id,entity_id,geographic_name_id', 'entity_id'),
    ('campaigns', 'display_order,id,name,slug,status', 'display_order,name,status'),
    ('categories', 'campaign_id,description,id,name,publication_status,slug', 'description,name,publication_status,slug'),
    ('character_location_events', 'campaign_id,character_id,event_type,geographic_name_id,id,language,location_entity_id,location_label,observed_at,publication_status,related_sighting_id,summary,x,y', 'character_id,event_type,geographic_name_id,language,location_entity_id,location_label,observed_at,publication_status,related_sighting_id,summary,x,y'),
    ('character_location_relations', 'campaign_id,character_id,location_id,publication_status,relation_status', 'publication_status,relation_status'),
    ('entity_aliases', 'campaign_id,entity_id,id,language,publication_status,value', 'entity_id,language,publication_status,value'),
    ('entity_map_placements', 'campaign_id,entity_id,geometry,map_context_id,publication_status', 'geometry,map_context_id,publication_status'),
    ('entity_player_associations', 'campaign_id,entity_id,player_id', ''),
    ('entity_player_dispositions', '', 'disposition'),
    ('entity_relations', 'campaign_id,left_entity_id,left_label,right_entity_id,right_label', ''),
    ('entity_tags', 'campaign_id,entity_id,id,publication_status,tag_id', 'entity_id,publication_status,tag_id'),
    ('geographic_name_aliases', 'geographic_name_id,id,language,publication_status,value', 'geographic_name_id,language,publication_status,value'),
    ('geographic_names', 'entity_id,id,language,name,publication_status,recommended_zoom,slug,x,y', 'entity_id,language,name,publication_status,recommended_zoom,slug,x,y'),
    ('map_contexts', 'attribution,height,id,image_uri,license_notes,loading_strategy,name,parent_id,publication_status,rights_holder,slug,source_url,width', 'attribution,height,image_uri,license_notes,loading_strategy,name,parent_id,publication_status,rights_holder,source_url,width'),
    ('map_entities', 'audience,campaign_id,category_id,description,entity_type,id,name,name_language,publication_status,slug,summary,visibility,x,y', 'audience,category_id,description,geometry,lifecycle_status,name,name_language,portrait_path,publication_status,slug,summary,visibility,x,y'),
    ('players', 'accent_color,campaign_id,display_name,display_order,id,name_language,publication_status,slug', 'accent_color,display_name,display_order,name_language,publication_status,slug'),
    ('public_note_tags', 'campaign_id,id,note_id,publication_status,tag_id', 'note_id,publication_status,tag_id'),
    ('public_notes', '', ''),
    ('public_requests', '', ''),
    ('tags', 'campaign_id,description,id,name,publication_status', 'description,name,publication_status')
), actual as (
  select table_name::text as name,
    coalesce(string_agg(column_name,',' order by column_name)
      filter(where privilege_type='INSERT'),'') as ins,
    coalesce(string_agg(column_name,',' order by column_name)
      filter(where privilege_type='UPDATE'),'') as upd
  from information_schema.column_privileges
  where table_schema='public' and grantee='authenticated'
    and privilege_type in ('INSERT','UPDATE')
  group by table_name
)
select is(
  (select count(*) from expected left join actual using (name)
   where expected.ins <> coalesce(actual.ins,'')
      or expected.upd <> coalesce(actual.upd,'')),
  0::bigint,
  'authenticated INSERT/UPDATE column allowlists remain exact'
);

-- Some public readers use explicit column SELECT despite missing table SELECT.
-- Without these projections, existing anonymous roster/relations endpoints break.
with expected(name, role_name, cols) as (
  values
    ('character_location_relations','anon','campaign_id,character_id,location_id,relation_status'),
    ('entity_player_associations','anon','campaign_id,entity_id,player_id'),
    ('entity_player_associations','authenticated','campaign_id,created_at,entity_id,player_id'),
    ('entity_relations','anon','campaign_id,left_entity_id,left_label,right_entity_id,right_label'),
    ('entity_relations','authenticated','campaign_id,created_at,left_entity_id,left_label,right_entity_id,right_label'),
    ('players','anon','accent_color,archived_at,campaign_id,created_at,display_name,display_order,id,name_language,publication_status,published_at,slug,updated_at'),
    ('players','authenticated','accent_color,archived_at,campaign_id,created_at,display_name,display_order,id,name_language,publication_status,published_at,slug,updated_at')
), actual as (
  select privilege.table_name::text as name, privilege.grantee::text as role_name,
         string_agg(privilege.column_name,',' order by privilege.column_name) as cols
  from information_schema.column_privileges privilege
  where privilege.table_schema='public'
    and privilege.grantee in ('anon','authenticated','service_role')
    and privilege.privilege_type='SELECT'
    and not pg_catalog.has_table_privilege(
      privilege.grantee,
      pg_catalog.format('%I.%I',privilege.table_schema,privilege.table_name)::regclass,
      'SELECT'
    )
  group by privilege.table_name, privilege.grantee
)
select is(
  (select count(*)
   from expected full join actual using (name, role_name)
   where expected.name is null or actual.name is null
      or expected.cols <> actual.cols),
  0::bigint,
  'restricted SELECT projections remain exact for private relations and roster'
);

select is(
  (select count(*) from information_schema.column_privileges
   where table_schema='public' and grantee in ('anon','service_role','PUBLIC')
     and privilege_type in ('INSERT','UPDATE')),
  0::bigint,
  'anon, service_role and PUBLIC have no column-level mutations'
);

select is(
  (select count(*) from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname <> 'rls_auto_enable'),
  31::bigint,
  'exactly 31 application-owned public RPCs exist (excluding the optional platform RLS hook)'
);

-- Production can include the platform-created RLS auto-enable event trigger.
-- Fresh CLI resets omit it. If present it must remain restricted, not an RPC.
select is(
  (select count(*) from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='rls_auto_enable'
     and (p.prorettype <> 'event_trigger'::regtype
       or not p.prosecdef
       or pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE'))),
  0::bigint,
  'optional platform RLS hook is not callable by Data API roles'
);

select is(
  (select count(*) from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and (
     pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
       <> (p.proname in ('begin_public_request_submission',
                        'submit_public_request_v3','create_public_player_note'))
     or pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
       <> (p.proname <> 'rls_auto_enable')
     or pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
   )),
  0::bigint,
  'anon and authenticated RPC EXECUTE match their audited allowlist, service_role has none'
);

select is(
  (select count(*) from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   cross join lateral pg_catalog.aclexplode(
     coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))
   ) grant_item
   where n.nspname='public' and grant_item.grantee=0
     and grant_item.privilege_type='EXECUTE'),
  0::bigint,
  'no public RPC is executable through the PUBLIC pseudo-role'
);

-- Creating an object without GRANT in an ordinary test transaction must not
-- expose it. The transaction ends in ROLLBACK (no persistent probe objects).
create table public.infra210_table_probe (id integer);
create sequence public.infra210_sequence_probe;
create function public.infra210_function_probe()
returns integer language sql security invoker set search_path = ''
as $$ select 1 $$;

select ok(
  not (
    select coalesce(bool_or(
      pg_catalog.has_table_privilege(role_name, 'public.infra210_table_probe',
        privilege_name)
    ), false)
    from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as privileges(privilege_name)
  ),
  'new table cannot be reached by anon, authenticated or service_role CRUD'
);

select ok(
  not (
    select coalesce(bool_or(
      pg_catalog.has_sequence_privilege(role_name, 'public.infra210_sequence_probe',
        privilege_name)
    ), false)
    from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name)
    cross join (values ('USAGE'), ('SELECT')) as privileges(privilege_name)
  ),
  'new sequence does not automatically grant usage or select'
);

select ok(
  not pg_catalog.has_function_privilege('anon', 'public.infra210_function_probe()', 'EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated', 'public.infra210_function_probe()', 'EXECUTE')
  and not pg_catalog.has_function_privilege('service_role', 'public.infra210_function_probe()', 'EXECUTE'),
  'new RPC cannot be executed by Data API roles without explicit GRANT'
);

-- The existing security/RLS suite also exercises admin/non-admin row access,
-- restricted drafts, public requests, moderation and MAP-075 placements.
select * from finish();
rollback;
