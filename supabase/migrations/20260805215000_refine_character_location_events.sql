-- MAP-015: refine public character trail semantics after the domain contraction.

alter table public.character_location_events
  add constraint character_location_events_related_departure_check
  check (event_type = 'departure' or related_sighting_id is null);

create function private.lock_related_sighting_for_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.publication_status = 'published' and new.related_sighting_id is not null then
    perform 1
    from public.character_location_events as related_sighting
    where related_sighting.id = new.related_sighting_id
      and related_sighting.event_type = 'sighting'
      and related_sighting.publication_status = 'published'
    for share;

    if not found then
      raise exception using
        errcode = '23514',
        message = 'a published departure requires a published related sighting';
    end if;
  end if;

  return new;
end;
$$;

create function private.protect_public_sighting_dependencies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.event_type = 'sighting'
     and old.publication_status = 'published'
     and new.publication_status <> 'published'
     and exists (
       select 1
       from public.character_location_events as departure
       where departure.related_sighting_id = old.id
         and departure.event_type = 'departure'
         and departure.publication_status = 'published'
     ) then
    raise exception using
      errcode = '23514',
      message = 'a sighting referenced by a published departure cannot be withdrawn';
  end if;

  return new;
end;
$$;

create trigger "15_lock_related_sighting_for_publication"
before insert or update on public.character_location_events
for each row execute function private.lock_related_sighting_for_publication();

create trigger "15_protect_public_sighting_dependencies"
before update on public.character_location_events
for each row execute function private.protect_public_sighting_dependencies();
