begin;

-- MAP-053 security checkpoint hardening: a public departure must not expose the
-- identity of a related sighting that is itself outside the public projection.
-- The helper is SECURITY DEFINER to evaluate the referenced row without
-- recursively invoking character_location_events RLS, but it returns true only
-- when the referenced sighting satisfies the complete public visibility contract.
create function private.is_public_related_sighting(
  p_event_id text,
  p_campaign_id uuid,
  p_character_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.character_location_events as sighting
    join public.campaigns as campaign
      on campaign.id = sighting.campaign_id
    join public.map_entities as character
      on character.id = sighting.character_id
     and character.campaign_id = sighting.campaign_id
    left join public.map_entities as location
      on location.id = sighting.location_entity_id
     and location.campaign_id = sighting.campaign_id
    left join public.geographic_names as geographic_name
      on geographic_name.id = sighting.geographic_name_id
    where sighting.id = p_event_id
      and sighting.campaign_id = p_campaign_id
      and sighting.character_id = p_character_id
      and sighting.event_type = 'sighting'::public.character_location_event_type
      and sighting.publication_status = 'published'::public.publication_status
      and campaign.status = 'active'
      and character.entity_type = 'character'::public.entity_type
      and character.publication_status = 'published'::public.publication_status
      and character.audience = 'public'::public.entity_audience
      and (
        sighting.location_entity_id is null
        or (
          location.entity_type = 'location'::public.entity_type
          and location.publication_status = 'published'::public.publication_status
          and location.audience = 'public'::public.entity_audience
        )
      )
      and (
        sighting.geographic_name_id is null
        or geographic_name.publication_status = 'published'::public.publication_status
      )
  );
$$;

revoke all on function private.is_public_related_sighting(text, uuid, text)
from public, anon, authenticated;
grant execute on function private.is_public_related_sighting(text, uuid, text)
to anon, authenticated;

drop policy if exists character_location_events_public_select
on public.character_location_events;
create policy character_location_events_public_select
on public.character_location_events
for select
to anon, authenticated
using (
  publication_status = 'published'::public.publication_status
  and exists (
    select 1
    from public.campaigns campaign
    where campaign.id = character_location_events.campaign_id
      and campaign.status = 'active'
  )
  and exists (
    select 1
    from public.map_entities character
    where character.id = character_location_events.character_id
      and character.campaign_id = character_location_events.campaign_id
      and character.entity_type = 'character'::public.entity_type
      and character.publication_status = 'published'::public.publication_status
      and character.audience = 'public'::public.entity_audience
  )
  and (
    location_entity_id is null
    or exists (
      select 1
      from public.map_entities location
      where location.id = character_location_events.location_entity_id
        and location.campaign_id = character_location_events.campaign_id
        and location.entity_type = 'location'::public.entity_type
        and location.publication_status = 'published'::public.publication_status
        and location.audience = 'public'::public.entity_audience
    )
  )
  and (
    geographic_name_id is null
    or exists (
      select 1
      from public.geographic_names geographic_name
      where geographic_name.id = character_location_events.geographic_name_id
        and geographic_name.publication_status = 'published'::public.publication_status
    )
  )
  and (
    related_sighting_id is null
    or (
      select private.is_public_related_sighting(
        character_location_events.related_sighting_id,
        character_location_events.campaign_id,
        character_location_events.character_id
      )
    )
  )
);

commit;
