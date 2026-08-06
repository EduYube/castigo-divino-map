begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

select ok(to_regclass('private.admin_users') is not null, 'private.admin_users exists');
select ok(to_regclass('private.reserved_public_identifiers') is not null, 'identifier reservations exist');

select ok(to_regclass('public.categories') is not null, 'categories exists');
select ok(to_regclass('public.tags') is not null, 'tags exists');
select ok(to_regclass('public.map_entities') is not null, 'map_entities exists');
select ok(to_regclass('public.players') is not null, 'players exists');
select ok(to_regclass('public.entity_player_dispositions') is not null, 'entity_player_dispositions exists');
select ok(to_regclass('public.entity_aliases') is not null, 'entity_aliases exists');
select ok(to_regclass('public.entity_tags') is not null, 'entity_tags exists');
select ok(to_regclass('public.public_notes') is not null, 'public_notes exists');
select ok(to_regclass('public.public_note_tags') is not null, 'public_note_tags exists');
select ok(to_regclass('public.geographic_names') is not null, 'geographic_names exists');
select ok(to_regclass('public.geographic_name_aliases') is not null, 'geographic_name_aliases exists');
select ok(to_regclass('public.character_location_events') is not null, 'character_location_events exists');
select ok(to_regclass('public.public_requests') is not null, 'public_requests exists');

select ok(to_regclass('public.character_locations') is null, 'legacy character_locations was contracted');

select is(
  (
    select array_agg(enumlabel order by enumsortorder)::text[]
    from pg_enum
    where enumtypid = 'public.entity_type'::regtype
  ),
  array['character', 'location']::text[],
  'entity types are closed and ordered'
);

select is(
  (
    select array_agg(enumlabel order by enumsortorder)::text[]
    from pg_enum
    where enumtypid = 'public.map_visibility'::regtype
  ),
  array['pin', 'search_only']::text[],
  'map visibility is closed and ordered'
);

select is(
  (
    select array_agg(enumlabel order by enumsortorder)::text[]
    from pg_enum
    where enumtypid = 'public.player_disposition'::regtype
  ),
  array['ally', 'enemy', 'neutral']::text[],
  'player dispositions exclude unknown'
);

select is(
  (
    select array_agg(enumlabel order by enumsortorder)::text[]
    from pg_enum
    where enumtypid = 'public.character_location_event_type'::regtype
  ),
  array['sighting', 'departure']::text[],
  'character location event types are closed and ordered'
);

select is(
  (
    select array_agg(enumlabel order by enumsortorder)::text[]
    from pg_enum
    where enumtypid = 'public.publication_status'::regtype
  ),
  array['draft', 'published', 'archived']::text[],
  'publication statuses are closed and ordered'
);

select is(
  (
    select array_agg(enumlabel order by enumsortorder)::text[]
    from pg_enum
    where enumtypid = 'public.request_status'::regtype
  ),
  array['pending', 'accepted', 'rejected', 'converted', 'archived']::text[],
  'request statuses are closed and ordered'
);

select ok(to_regtype('public.disposition') is null, 'legacy global disposition type was removed');

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'map_entities'
      and column_name = 'disposition'
  ),
  'map_entities has no global disposition column'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'map_entities'
      and column_name = 'visibility'
  ),
  'map_entities exposes visibility'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'map_entities'
      and column_name = 'name_language'
  ),
  'map_entities records the primary-name language'
);

select ok(
  (
    select bool_and(table_class.relrowsecurity)
    from pg_class as table_class
    join pg_namespace as table_namespace
      on table_namespace.oid = table_class.relnamespace
    where table_namespace.nspname = 'public'
      and table_class.relname = any (
        array[
          'categories',
          'tags',
          'map_entities',
          'players',
          'entity_player_dispositions',
          'entity_aliases',
          'entity_tags',
          'public_notes',
          'public_note_tags',
          'geographic_names',
          'geographic_name_aliases',
          'character_location_events',
          'public_requests'
        ]
      )
  ),
  'RLS is enabled on every exposed application table'
);

select ok(
  (
    select table_class.relrowsecurity
    from pg_class as table_class
    join pg_namespace as table_namespace
      on table_namespace.oid = table_class.relnamespace
    where table_namespace.nspname = 'private'
      and table_class.relname = 'admin_users'
  ),
  'RLS is enabled on private.admin_users as defense in depth'
);

select ok(
  not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'private'
      and grantee in ('anon', 'authenticated')
  ),
  'client roles have no private table grants'
);

select ok(
  (
    select function_definition.prosecdef
    from pg_proc as function_definition
    join pg_namespace as function_namespace
      on function_namespace.oid = function_definition.pronamespace
    where function_namespace.nspname = 'private'
      and function_definition.proname = 'is_admin'
  ),
  'private.is_admin is security definer'
);

select ok(
  not exists (
    select 1
    from pg_class as view_definition
    join pg_namespace as view_namespace
      on view_namespace.oid = view_definition.relnamespace
    where view_namespace.nspname = 'public'
      and view_definition.relkind = 'v'
      and not coalesce(view_definition.reloptions, '{}') @> array['security_invoker=true']
  ),
  'there are no exposed views that bypass caller RLS'
);

select * from finish();
rollback;
