-- INFRA #210. This file is run AFTER a clean db reset by supabase:db:validate.
-- Full table and per-column allowlist came from the read-only 2026-10-21
-- production audit; regressions must be deliberate and reviewed.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

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

-- All eight effective table rights; retain historical service_role Dxtm.
create function pg_temp.infra210_table_acl_drift()
returns bigint language sql stable security invoker set search_path = ''
as $$
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
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
  )
  select count(*) from expected join real using(name)
  cross join lateral (values
      ('anon', 'SELECT', expected.anon_read),
      ('anon', 'INSERT', false),
      ('anon', 'UPDATE', false),
      ('anon', 'DELETE', false),
      ('anon', 'TRUNCATE', false),
      ('anon', 'REFERENCES', false),
      ('anon', 'TRIGGER', false),
      ('anon', 'MAINTAIN', false),
      ('authenticated', 'SELECT', expected.authenticated_read),
      ('authenticated', 'INSERT', false),
      ('authenticated', 'UPDATE', false),
      ('authenticated', 'DELETE', expected.authenticated_delete),
      ('authenticated', 'TRUNCATE', false),
      ('authenticated', 'REFERENCES', false),
      ('authenticated', 'TRIGGER', false),
      ('authenticated', 'MAINTAIN', false),
      ('service_role', 'SELECT', false),
      ('service_role', 'INSERT', false),
      ('service_role', 'UPDATE', false),
      ('service_role', 'DELETE', false),
      ('service_role', 'TRUNCATE', true),
      ('service_role', 'REFERENCES', true),
      ('service_role', 'TRIGGER', true),
      ('service_role', 'MAINTAIN', true)
  ) wanted(role_name, privilege_name, allowed)
  where pg_catalog.has_table_privilege(wanted.role_name,real.oid,wanted.privilege_name)
    <> wanted.allowed;
$$;

select is(pg_temp.infra210_table_acl_drift(), 0::bigint,
  'all eight table privileges match the least-privilege matrix and historical service_role Dxtm');

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
-- Exhaustive effective SELECT check: unlike direct grants, this catches
-- SELECT inherited from PUBLIC on individual columns.
create function pg_temp.infra210_restricted_select_drift()
returns bigint language sql stable security invoker set search_path = ''
as $$
  with expected(name, role_name, cols) as (
    values
    ('character_location_relations','anon','campaign_id,character_id,location_id,relation_status'),
    ('entity_player_associations','anon','campaign_id,entity_id,player_id'),
    ('entity_player_associations','authenticated','campaign_id,created_at,entity_id,player_id'),
    ('entity_relations','anon','campaign_id,left_entity_id,left_label,right_entity_id,right_label'),
    ('entity_relations','authenticated','campaign_id,created_at,left_entity_id,left_label,right_entity_id,right_label'),
    ('players','anon','accent_color,archived_at,campaign_id,created_at,display_name,display_order,id,name_language,publication_status,published_at,slug,updated_at'),
    ('players','authenticated','accent_color,archived_at,campaign_id,created_at,display_name,display_order,id,name_language,publication_status,published_at,slug,updated_at')
  )
  select count(*)
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid=c.oid
    and a.attnum>0 and not a.attisdropped
  cross join (values ('anon'), ('authenticated'), ('service_role')) roles(role_name)
  left join expected on expected.name=c.relname::text
    and expected.role_name=roles.role_name
  where n.nspname='public' and c.relkind in ('r','p')
    and not pg_catalog.has_table_privilege(roles.role_name,c.oid,'SELECT')
    and pg_catalog.has_column_privilege(
      roles.role_name,c.oid,a.attname::text,'SELECT'
    ) <> coalesce(
      a.attname::text = any(pg_catalog.string_to_array(expected.cols,',')),false
    );
$$;

select is(pg_temp.infra210_restricted_select_drift(),0::bigint,
  'restricted effective SELECT projections detect inherited PUBLIC access');

-- PUBLIC attacl is forbidden for ALL rights (including restricted SELECT).
select is(
  (select count(*) from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   join pg_catalog.pg_attribute a on a.attrelid=c.oid
     and a.attnum>0 and not a.attisdropped
   cross join lateral pg_catalog.aclexplode(a.attacl) acl
   where n.nspname='public' and c.relkind in ('r','p') and acl.grantee=0),
  0::bigint,
  'PUBLIC has no direct column privilege in pg_attribute.attacl'
);

-- Pinned complete RPC signatures, not just an inventory count.
with expected(signature) as (
  values
    ('admin_get_map_entity_editor_v2(text)'),
    ('admin_get_map_entity_editor_v3(text)'),
    ('admin_get_map_entity_editor_v4(uuid,text)'),
    ('admin_get_map_entity_editor_v5(uuid,text)'),
    ('admin_get_map_entity_editor_v6(uuid,text)'),
    ('admin_get_map_entity_editor_v7(uuid,text)'),
    ('admin_get_map_entity_editor_v8(uuid,text)'),
    ('admin_get_map_entity_editor(text)'),
    ('admin_get_master_catalog_v2()'),
    ('admin_get_master_catalog_v3(uuid)'),
    ('admin_get_master_catalog_v4(uuid)'),
    ('admin_get_master_catalog_v5(uuid)'),
    ('admin_get_master_catalog_v6(uuid)'),
    ('admin_get_master_catalog_v7(uuid)'),
    ('admin_get_master_catalog()'),
    ('admin_moderate_public_request_v2(uuid,uuid,timestamp with time zone,text,text)'),
    ('admin_save_map_entity_v2(text,timestamp with time zone,text,text,entity_type,map_visibility,entity_audience,text,text,text,double precision,double precision,text,publication_status,text[],jsonb)'),
    ('admin_save_map_entity_v3(text,timestamp with time zone,text,text,entity_type,map_visibility,entity_audience,text,text,text,text,double precision,double precision,text,publication_status,text[],jsonb)'),
    ('admin_save_map_entity_v4(uuid,text,timestamp with time zone,text,text,entity_type,map_visibility,entity_audience,text,text,text,text,double precision,double precision,text,publication_status,text[],jsonb)'),
    ('admin_save_map_entity_v5(uuid,text,timestamp with time zone,text,text,entity_type,map_visibility,entity_audience,text,text,text,text,double precision,double precision,text,publication_status,text[],jsonb,text[])'),
    ('admin_save_map_entity_v6(uuid,text,timestamp with time zone,text,text,entity_type,map_visibility,entity_audience,text,text,text,text,jsonb,text,publication_status,text[],jsonb,text[])'),
    ('admin_save_map_entity_v7(uuid,text,timestamp with time zone,text,text,entity_type,map_visibility,entity_audience,text,text,text,text,jsonb,text,publication_status,text[],jsonb,text[],entity_lifecycle_status)'),
    ('admin_save_map_entity_v8(uuid,text,timestamp with time zone,text,text,text,entity_type,map_visibility,entity_audience,text,text,text,text,jsonb,text,publication_status,text[],jsonb,text[],entity_lifecycle_status,jsonb)'),
    ('admin_save_map_entity(text,timestamp with time zone,text,text,entity_type,map_visibility,text,text,text,double precision,double precision,text,publication_status,text[],jsonb)'),
    ('archive_master_public_note(text,text)'),
    ('begin_public_request_submission(uuid)'),
    ('create_master_public_note(text,text,text)'),
    ('create_public_player_note(text,text,text,text)'),
    ('current_user_is_admin()'),
    ('submit_public_request_v3(text,text,text,entity_type,double precision,double precision,text,text,text)'),
    ('update_master_public_note(text,text,text,text)')
), real as (
  select p.oid::regprocedure::text as signature
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname <> 'rls_auto_enable'
)
select is(
  (select count(*) from expected full join real using(signature)
   where expected.signature is null or real.signature is null),
  0::bigint,
  'all 31 product RPC identities match names and argument types'
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
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
      ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) as privileges(privilege_name)
  ),
  'new table denies all eight privileges to anon, authenticated, service_role'
);

select ok(
  not (
    select coalesce(bool_or(
      pg_catalog.has_sequence_privilege(role_name, 'public.infra210_sequence_probe',
        privilege_name)
    ), false)
    from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name)
    cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) as privileges(privilege_name)
  ),
  'new sequence denies USAGE, SELECT and UPDATE to all Data API roles'
);

select ok(
  not pg_catalog.has_function_privilege('anon', 'public.infra210_function_probe()', 'EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated', 'public.infra210_function_probe()', 'EXECUTE')
  and not pg_catalog.has_function_privilege('service_role', 'public.infra210_function_probe()', 'EXECUTE'),
  'new RPC cannot be executed by Data API roles without explicit GRANT'
);

-- Mutation sensitivity, executed only in the rolled-back local test.
grant select (created_at) on public.entity_relations to public;
select ok(pg_temp.infra210_restricted_select_drift()>0,
  'PUBLIC SELECT(created_at) triggers effective restricted-SELECT guard');
revoke select (created_at) on public.entity_relations from public;
select is(pg_temp.infra210_restricted_select_drift(),0::bigint,
  'restricted-SELECT guard returns to green after removing injected grant');

grant truncate on public.map_entities to anon;
select ok(pg_temp.infra210_table_acl_drift()>0,
  'anon TRUNCATE triggers all-rights table guard despite unchanged CRUD');
revoke truncate on public.map_entities from anon;
select is(pg_temp.infra210_table_acl_drift(),0::bigint,
  'table guard returns to green after removing injected TRUNCATE');

grant update on sequence public.infra210_sequence_probe to authenticated;
select ok(pg_catalog.has_sequence_privilege(
  'authenticated','public.infra210_sequence_probe','UPDATE'),
  'sequence UPDATE injection is observed by the privilege check');
revoke update on sequence public.infra210_sequence_probe from authenticated;
select ok(not pg_catalog.has_sequence_privilege(
  'authenticated','public.infra210_sequence_probe','UPDATE'),
  'sequence UPDATE is denied again after negative control');

-- The existing security/RLS suite also exercises admin/non-admin row access,
-- restricted drafts, public requests, moderation and MAP-075 placements.
select * from finish();
rollback;
