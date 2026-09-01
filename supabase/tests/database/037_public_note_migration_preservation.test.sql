begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

select is(
  (select entity_id from public.public_notes where id = 'note-demo-harbor-overview'),
  'place-demo-harbor'::text,
  'MAP-063 preserves the legacy note entity link'
);

select is(
  (select body from public.public_notes where id = 'note-demo-harbor-overview'),
  'Este puerto ficticio sirve para comprobar fichas, búsquedas y filtros sin representar hechos secretos ni confirmados de la campaña.'::text,
  'MAP-063 preserves the legacy note body verbatim'
);

select is(
  (select sort_order from public.public_notes where id = 'note-demo-harbor-overview'),
  0,
  'MAP-063 preserves the legacy note ordering metadata'
);

select is(
  (
    select pg_catalog.array_agg(note_tag.tag_id order by note_tag.tag_id)
    from public.public_note_tags as note_tag
    where note_tag.note_id = 'note-demo-harbor-overview'
  ),
  array['coastal', 'demo-data']::text[],
  'MAP-063 preserves every legacy note tag relation'
);

select is(
  (select author_kind::text from public.public_notes where id = 'note-demo-harbor-overview'),
  'master'::text,
  'legacy note receives historical Master authorship'
);

select is(
  (select author_player_id from public.public_notes where id = 'note-demo-harbor-overview'),
  null::text,
  'historical Master authorship has no player id'
);

select is(
  (select last_modifier_kind::text from public.public_notes where id = 'note-demo-harbor-overview'),
  'master'::text,
  'legacy note records Master as its historical last modifier'
);

select is(
  (select last_modifier_player_id from public.public_notes where id = 'note-demo-harbor-overview'),
  null::text,
  'historical Master modifier has no player id'
);

select ok(
  (
    select created_at = updated_at
    from public.public_notes
    where id = 'note-demo-harbor-overview'
  ),
  'the authorship backfill does not advance the legacy updated_at timestamp'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger as trigger
    join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    join pg_catalog.pg_proc as function on function.oid = trigger.tgfoid
    join pg_catalog.pg_namespace as function_namespace on function_namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and relation.relname = 'public_notes'
      and trigger.tgname = '90_public_note_updated_at'
      and not trigger.tgisinternal
      and function_namespace.nspname = 'private'
      and function.proname = 'set_updated_at'
  ),
  'MAP-063 restores the standard public_notes updated_at trigger after backfill'
);

select * from finish();
rollback;
