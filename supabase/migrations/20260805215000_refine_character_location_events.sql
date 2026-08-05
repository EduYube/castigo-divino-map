-- MAP-015: refine public character trail semantics after the domain contraction.

alter table public.character_location_events
  add constraint character_location_events_related_departure_check
  check (event_type = 'departure' or related_sighting_id is null);

drop policy character_location_events_public_select
on public.character_location_events;

create policy character_location_events_public_select
on public.character_location_events
for select
to anon, authenticated
using (
  publication_status = 'published'
  and exists (
    select 1
    from public.map_entities as character
    where character.id = character_location_events.character_id
      and character.publication_status = 'published'
  )
  and (
    location_entity_id is null
    or exists (
      select 1
      from public.map_entities as location
      where location.id = character_location_events.location_entity_id
        and location.publication_status = 'published'
    )
  )
  and (
    geographic_name_id is null
    or exists (
      select 1
      from public.geographic_names as geographic_name
      where geographic_name.id = character_location_events.geographic_name_id
        and geographic_name.publication_status = 'published'
    )
  )
  and (
    related_sighting_id is null
    or exists (
      select 1
      from public.character_location_events as related_sighting
      where related_sighting.id = character_location_events.related_sighting_id
        and related_sighting.event_type = 'sighting'
        and related_sighting.publication_status = 'published'
    )
  )
);
