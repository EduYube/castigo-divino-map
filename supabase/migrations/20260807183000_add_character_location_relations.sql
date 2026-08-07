-- MAP-020: normalized important-character relationships for locations.
--
-- This table is intentionally separate from character_location_events. Events are
-- chronological public evidence; this relation is the single editorial source of
-- truth for the current public relationship state used by location/entity cards.

create type public.character_location_relation_status as enum (
  'present',
  'associated',
  'last-seen'
);

create table public.character_location_relations (
  character_id text not null
    references public.map_entities (id) on update restrict on delete restrict,
  location_id text not null
    references public.map_entities (id) on update restrict on delete restrict,
  relation_status public.character_location_relation_status not null,
  publication_status public.publication_status not null default 'draft',
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint character_location_relations_pkey primary key (character_id, location_id),
  constraint character_location_relations_distinct_endpoints check (character_id <> location_id)
);

create index character_location_relations_location_idx
  on public.character_location_relations (location_id, relation_status, character_id);

create function private.validate_character_location_relation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  character_type public.entity_type;
  character_status public.publication_status;
  location_type public.entity_type;
  location_status public.publication_status;
begin
  if tg_op = 'UPDATE' and (
    new.character_id is distinct from old.character_id
    or new.location_id is distinct from old.location_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'character-location relation endpoints are immutable';
  end if;

  select entity.entity_type, entity.publication_status
  into character_type, character_status
  from public.map_entities as entity
  where entity.id = new.character_id
  for share;

  if not found or character_type <> 'character' then
    raise exception using
      errcode = '23514',
      message = 'character-location relation requires a character endpoint';
  end if;

  select entity.entity_type, entity.publication_status
  into location_type, location_status
  from public.map_entities as entity
  where entity.id = new.location_id
  for share;

  if not found or location_type <> 'location' then
    raise exception using
      errcode = '23514',
      message = 'character-location relation requires a location endpoint';
  end if;

  -- Retirement remains possible as a repair path even if an endpoint was
  -- archived outside the normal application flow. Creating, restoring or
  -- editing an active relation to an archived endpoint is always rejected.
  if new.publication_status <> 'archived'
     and (character_status = 'archived' or location_status = 'archived') then
    raise exception using
      errcode = '23514',
      message = 'character-location relation cannot reference archived endpoints';
  end if;

  if new.publication_status = 'published'
     and (character_status <> 'published' or location_status <> 'published') then
    raise exception using
      errcode = '23514',
      message = 'published character-location relation requires published endpoints';
  end if;

  return new;
end;
$$;

create function private.block_map_entity_archive_with_character_location_relations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.publication_status = 'archived'
     and old.publication_status is distinct from 'archived'
     and exists (
       select 1
       from public.character_location_relations as relation
       where relation.publication_status <> 'archived'
         and (
           relation.character_id = old.id
           or relation.location_id = old.id
         )
     ) then
    raise exception using
      errcode = '23514',
      message = 'active character-location relations must be retired before archiving the entity';
  end if;

  return new;
end;
$$;

create trigger "20_validate_character_location_relation"
before insert or update on public.character_location_relations
for each row execute function private.validate_character_location_relation();

create trigger "40_character_location_relation_lifecycle"
before insert or update on public.character_location_relations
for each row execute function private.enforce_publication_lifecycle();

create trigger "80_character_location_relation_delete"
before delete on public.character_location_relations
for each row execute function private.prevent_published_physical_delete();

create trigger "90_character_location_relation_updated_at"
before update on public.character_location_relations
for each row execute function private.set_updated_at();

create trigger "35_map_entity_character_location_archive_guard"
before update of publication_status on public.map_entities
for each row execute function private.block_map_entity_archive_with_character_location_relations();

alter table public.character_location_relations enable row level security;

create policy character_location_relations_public_select
on public.character_location_relations
for select
to anon
using (
  publication_status = 'published'
  and exists (
    select 1
    from public.map_entities as character
    where character.id = character_location_relations.character_id
      and character.entity_type = 'character'
      and character.publication_status = 'published'
  )
  and exists (
    select 1
    from public.map_entities as location
    where location.id = character_location_relations.location_id
      and location.entity_type = 'location'
      and location.publication_status = 'published'
  )
);

create policy character_location_relations_admin_select
on public.character_location_relations
for select
to authenticated
using ((select private.is_admin()));

create policy character_location_relations_admin_insert
on public.character_location_relations
for insert
to authenticated
with check ((select private.is_admin()));

create policy character_location_relations_admin_update
on public.character_location_relations
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy character_location_relations_admin_delete
on public.character_location_relations
for delete
to authenticated
using ((select private.is_admin()) and published_at is null);

revoke all on table public.character_location_relations from anon, authenticated;
grant select (character_id, location_id, relation_status)
  on public.character_location_relations to anon;
grant select, delete on table public.character_location_relations to authenticated;
grant insert (character_id, location_id, relation_status, publication_status)
  on public.character_location_relations to authenticated;
grant update (relation_status, publication_status)
  on public.character_location_relations to authenticated;

comment on table public.character_location_relations is
  'MAP-020 single source of truth for public character-to-location relationship state.';
comment on column public.character_location_relations.relation_status is
  'Public meaning: present, associated, or last-seen.';
comment on function private.validate_character_location_relation() is
  'Validates endpoint type/lifecycle and locks both endpoints while a MAP-020 relation changes.';
comment on function private.block_map_entity_archive_with_character_location_relations() is
  'Requires active MAP-020 relations to be explicitly retired before an endpoint is archived.';
