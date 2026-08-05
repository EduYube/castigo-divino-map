begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create function pg_temp.sqlstate_for(statement text)
returns text
language plpgsql
as $$
begin
  execute statement;
  return null;
exception
  when others then
    return sqlstate;
end;
$$;

select plan(3);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select is(
  pg_temp.sqlstate_for(
    $$insert into public.character_location_events (
      id,
      character_id,
      event_type,
      x,
      y,
      related_sighting_id
    ) values (
      'location-event-invalid-related-sighting',
      'entity-aster-guide',
      'sighting',
      1700,
      1000,
      'relation-aster-bramble'
    )$$
  ),
  '23514',
  'only departure events may reference a related sighting'
);

select lives_ok(
  $$insert into public.character_location_events (
      id,
      character_id,
      event_type,
      x,
      y,
      location_label,
      publication_status
    ) values (
      'location-event-departure-without-destination',
      'entity-aster-guide',
      'departure',
      1750,
      1050,
      'Left an unnamed campsite',
      'published'
    )$$,
  'a public departure may have no related sighting or known destination'
);

select throws_ok(
  $$update public.character_location_events
    set publication_status = 'draft'
    where id = 'relation-aster-bramble'$$,
  '23514',
  'a sighting referenced by a published departure cannot be withdrawn',
  'a public departure cannot retain a hidden related sighting'
);

select * from finish();
rollback;
