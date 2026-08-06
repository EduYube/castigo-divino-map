-- MAP-015 review hardening: serialize the entity-player matrix and preserve
-- character trail invariants from both sides of a related sighting.

create or replace function private.ensure_entity_player_dispositions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Both insertion paths must acquire the same transaction-scoped lock before
  -- reading the opposite table. This prevents concurrent entity/player inserts
  -- from missing each other under READ COMMITTED.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('entity-player-disposition-matrix', 0)
  );

  if tg_table_name = 'map_entities' then
    insert into public.entity_player_dispositions (entity_id, player_id)
    select new.id, player.id
    from public.players as player
    on conflict do nothing;
  elsif tg_table_name = 'players' then
    insert into public.entity_player_dispositions (entity_id, player_id)
    select entity.id, new.id
    from public.map_entities as entity
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- Repair any pair that may have been absent before the serialization lock was
-- installed. The lock also prevents a concurrent insert from racing this pass.
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('entity-player-disposition-matrix', 0)
);

insert into public.entity_player_dispositions (entity_id, player_id)
select entity.id, player.id
from public.map_entities as entity
cross join public.players as player
on conflict do nothing;

DO $$
begin
  if exists (
    select 1
    from public.map_entities as entity
    cross join public.players as player
    left join public.entity_player_dispositions as relation
      on relation.entity_id = entity.id
      and relation.player_id = player.id
    where relation.entity_id is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'the entity-player disposition matrix must be complete';
  end if;

  if exists (
    select 1
    from public.character_location_events as departure
    left join public.character_location_events as sighting
      on sighting.id = departure.related_sighting_id
    where departure.related_sighting_id is not null
      and (
        sighting.id is null
        or sighting.event_type <> 'sighting'
        or sighting.character_id <> departure.character_id
        or (
          departure.observed_at is not null
          and sighting.observed_at is not null
          and departure.observed_at < sighting.observed_at
        )
        or (
          departure.publication_status = 'published'
          and sighting.publication_status <> 'published'
        )
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'existing character trail relations violate sighting invariants';
  end if;
end;
$$;

drop trigger if exists "15_lock_related_sighting_for_publication"
  on public.character_location_events;
drop function if exists private.lock_related_sighting_for_publication();

create function private.lock_related_sighting_for_relation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  related_event public.character_location_events%rowtype;
begin
  if new.related_sighting_id is null then
    return new;
  end if;

  select *
  into related_event
  from public.character_location_events as event
  where event.id = new.related_sighting_id
  for share;

  if not found
     or related_event.event_type <> 'sighting'
     or related_event.character_id <> new.character_id then
    raise exception using
      errcode = '23514',
      message = 'a related sighting must belong to the same character';
  end if;

  if new.observed_at is not null
     and related_event.observed_at is not null
     and new.observed_at < related_event.observed_at then
    raise exception using
      errcode = '23514',
      message = 'a departure cannot precede its related sighting';
  end if;

  if new.publication_status = 'published'
     and related_event.publication_status <> 'published' then
    raise exception using
      errcode = '23514',
      message = 'a published departure requires a published related sighting';
  end if;

  return new;
end;
$$;

create trigger "15_lock_related_sighting_for_relation"
before insert or update on public.character_location_events
for each row execute function private.lock_related_sighting_for_relation();

create or replace function private.protect_public_sighting_dependencies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.character_location_events as departure
    where departure.related_sighting_id = old.id
  ) then
    return new;
  end if;

  if new.event_type <> 'sighting' then
    raise exception using
      errcode = '23514',
      message = 'a referenced sighting must remain a sighting';
  end if;

  if exists (
    select 1
    from public.character_location_events as departure
    where departure.related_sighting_id = old.id
      and departure.character_id <> new.character_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'a related sighting must belong to the same character';
  end if;

  if exists (
    select 1
    from public.character_location_events as departure
    where departure.related_sighting_id = old.id
      and departure.observed_at is not null
      and new.observed_at is not null
      and departure.observed_at < new.observed_at
  ) then
    raise exception using
      errcode = '23514',
      message = 'a departure cannot precede its related sighting';
  end if;

  if new.publication_status <> 'published'
     and exists (
       select 1
       from public.character_location_events as departure
       where departure.related_sighting_id = old.id
         and departure.publication_status = 'published'
     ) then
    raise exception using
      errcode = '23514',
      message = 'a sighting referenced by a published departure cannot be withdrawn';
  end if;

  return new;
end;
$$;
