-- MAP-015: expand the Beta 0.2 entity domain without rewriting applied migrations.
-- This migration adds the new public contracts before the legacy columns/tables are removed.

create type public.map_visibility as enum (
  'pin',
  'search_only'
);

create type public.player_disposition as enum (
  'ally',
  'enemy',
  'neutral'
);

create type public.character_location_event_type as enum (
  'sighting',
  'departure'
);

alter table public.map_entities
  add column visibility public.map_visibility not null default 'pin',
  add column name_language text not null default 'en',
  add constraint map_entities_name_language_check check (name_language = 'en');

alter table public.map_entities
  drop constraint map_entities_location_disposition_check;

update public.map_entities
set disposition = 'neutral'
where disposition = 'unknown';

alter table public.map_entities
  alter column disposition set default 'neutral';

create table public.players (
  id text primary key,
  slug text not null unique,
  display_name text not null,
  name_language text not null default 'en',
  publication_status public.publication_status not null default 'draft',
  published_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint players_id_check
    check (id ~ '^player-[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint players_slug_check
    check (slug ~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint players_display_name_check
    check (char_length(btrim(display_name)) between 1 and 120),
  constraint players_name_language_check
    check (name_language = 'en')
);

create table public.entity_player_dispositions (
  entity_id text not null references public.map_entities (id)
    on update restrict on delete cascade,
  player_id text not null references public.players (id)
    on update restrict on delete cascade,
  disposition public.player_disposition not null default 'neutral',
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  primary key (entity_id, player_id)
);

create table public.geographic_name_aliases (
  id text primary key,
  geographic_name_id text not null references public.geographic_names (id)
    on update restrict on delete restrict,
  language text not null default 'en',
  value text not null,
  normalized_value text not null,
  publication_status public.publication_status not null default 'draft',
  published_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint geographic_name_aliases_id_check
    check (id ~ '^geo-alias-[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint geographic_name_aliases_language_check
    check (language = 'en'),
  constraint geographic_name_aliases_value_check
    check (char_length(btrim(value)) between 1 and 160),
  constraint geographic_name_aliases_normalized_value_check
    check (char_length(normalized_value) between 1 and 160),
  constraint geographic_name_aliases_parent_normalized_unique
    unique (geographic_name_id, normalized_value)
);

create table public.public_note_tags (
  id text primary key,
  note_id text not null references public.public_notes (id)
    on update restrict on delete restrict,
  tag_id text not null references public.tags (id)
    on update restrict on delete restrict,
  publication_status public.publication_status not null default 'draft',
  published_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint public_note_tags_id_check
    check (id ~ '^note-tag-[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint public_note_tags_pair_unique
    unique (note_id, tag_id)
);

create table public.character_location_events (
  id text primary key,
  character_id text not null references public.map_entities (id)
    on update restrict on delete restrict,
  event_type public.character_location_event_type not null,
  location_entity_id text references public.map_entities (id)
    on update restrict on delete restrict,
  geographic_name_id text references public.geographic_names (id)
    on update restrict on delete restrict,
  x double precision,
  y double precision,
  location_label text,
  summary text not null default '',
  language text not null default 'en',
  observed_at timestamp with time zone,
  related_sighting_id text references public.character_location_events (id)
    on update restrict on delete restrict,
  publication_status public.publication_status not null default 'draft',
  published_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint character_location_events_id_check
    check (id ~ '^(location-event|relation)-[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint character_location_events_location_check
    check (
      location_entity_id is not null
      or geographic_name_id is not null
      or (x is not null and y is not null)
    ),
  constraint character_location_events_coordinates_pair_check
    check ((x is null and y is null) or (x is not null and y is not null)),
  constraint character_location_events_x_check
    check (
      x is null
      or (
        x between 0 and 3600
        and x not in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
      )
    ),
  constraint character_location_events_y_check
    check (
      y is null
      or (
        y between 0 and 2329
        and y not in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
      )
    ),
  constraint character_location_events_label_check
    check (location_label is null or char_length(btrim(location_label)) between 1 and 240),
  constraint character_location_events_summary_check
    check (char_length(summary) <= 1000),
  constraint character_location_events_language_check
    check (language = 'en'),
  constraint character_location_events_related_check
    check (related_sighting_id is null or related_sighting_id <> id)
);

create index players_publication_status_idx
  on public.players (publication_status);

create index entity_player_dispositions_player_id_idx
  on public.entity_player_dispositions (player_id);

create index geographic_name_aliases_geographic_name_id_idx
  on public.geographic_name_aliases (geographic_name_id);

create index public_note_tags_note_id_idx
  on public.public_note_tags (note_id);

create index public_note_tags_tag_id_idx
  on public.public_note_tags (tag_id);

create index character_location_events_character_observed_idx
  on public.character_location_events (character_id, observed_at desc, created_at desc);

create index character_location_events_location_entity_id_idx
  on public.character_location_events (location_entity_id);

create index character_location_events_geographic_name_id_idx
  on public.character_location_events (geographic_name_id);

create index character_location_events_related_sighting_id_idx
  on public.character_location_events (related_sighting_id);

create unique index geographic_name_aliases_published_normalized_value_uidx
  on public.geographic_name_aliases (normalized_value)
  where publication_status = 'published';

with alias_source as (
  select
    geographic_name.id as geographic_name_id,
    geographic_name.language,
    geographic_name.publication_status,
    geographic_name.published_at,
    geographic_name.archived_at,
    geographic_name.created_at,
    geographic_name.updated_at,
    btrim(alias_value) as value,
    private.normalize_search_text(alias_value) as normalized_value
  from public.geographic_names as geographic_name
  cross join lateral unnest(geographic_name.aliases) as alias_value
  where btrim(alias_value) <> ''
),
deduplicated_aliases as (
  select distinct on (geographic_name_id, normalized_value)
    geographic_name_id,
    language,
    publication_status,
    published_at,
    archived_at,
    created_at,
    updated_at,
    value,
    normalized_value
  from alias_source
  where normalized_value <> ''
  order by geographic_name_id, normalized_value, value
)
insert into public.geographic_name_aliases (
  id,
  geographic_name_id,
  language,
  value,
  normalized_value,
  publication_status,
  published_at,
  archived_at,
  created_at,
  updated_at
)
select
  'geo-alias-' || substr(md5(geographic_name_id || ':' || normalized_value), 1, 24),
  geographic_name_id,
  language,
  value,
  normalized_value,
  publication_status,
  published_at,
  archived_at,
  created_at,
  updated_at
from deduplicated_aliases;

insert into public.character_location_events (
  id,
  character_id,
  event_type,
  location_entity_id,
  location_label,
  summary,
  language,
  publication_status,
  published_at,
  archived_at,
  created_at,
  updated_at
)
select
  id,
  character_id,
  'sighting',
  location_id,
  label,
  '',
  'en',
  publication_status,
  published_at,
  archived_at,
  created_at,
  updated_at
from public.character_locations;

insert into private.reserved_public_identifiers (namespace, value)
select 'geographic_name_alias_id', id
from public.geographic_name_aliases
where published_at is not null
on conflict do nothing;

insert into private.reserved_public_identifiers (namespace, value)
select 'character_location_event_id', id
from public.character_location_events
where published_at is not null
on conflict do nothing;

create function private.normalize_player()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.display_name := btrim(new.display_name);
  return new;
end;
$$;

create function private.normalize_geographic_name_alias()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.value := btrim(new.value);
  new.normalized_value := private.normalize_search_text(new.value);
  return new;
end;
$$;

create function private.normalize_character_location_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.location_label := nullif(btrim(new.location_label), '');
  new.summary := btrim(new.summary);
  return new;
end;
$$;

create function private.ensure_entity_player_dispositions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

create function private.validate_geographic_name_alias()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.publication_status = 'published' and not exists (
    select 1
    from public.geographic_names as geographic_name
    where geographic_name.id = new.geographic_name_id
      and geographic_name.publication_status = 'published'
  ) then
    raise exception using
      errcode = '23514',
      message = 'a published geographic alias requires a published geographic name';
  end if;

  return new;
end;
$$;

create function private.validate_public_note_tag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.publication_status = 'published' then
    if not exists (
      select 1
      from public.public_notes as note
      where note.id = new.note_id
        and note.publication_status = 'published'
    ) then
      raise exception using
        errcode = '23514',
        message = 'a published note tag requires published endpoints';
    end if;

    perform 1
    from public.tags as tag
    where tag.id = new.tag_id
      and tag.publication_status = 'published'
    for share;

    if not found then
      raise exception using
        errcode = '23514',
        message = 'a published note tag requires published endpoints';
    end if;
  end if;

  return new;
end;
$$;

create function private.validate_character_location_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  related_event public.character_location_events%rowtype;
begin
  if not exists (
    select 1
    from public.map_entities as character
    where character.id = new.character_id
      and character.entity_type = 'character'
  ) then
    raise exception using
      errcode = '23514',
      message = 'a character location event requires a character entity';
  end if;

  if new.location_entity_id is not null and not exists (
    select 1
    from public.map_entities as location
    where location.id = new.location_entity_id
      and location.entity_type = 'location'
  ) then
    raise exception using
      errcode = '23514',
      message = 'a character location event location_entity_id must reference a location';
  end if;

  if new.related_sighting_id is not null then
    select *
    into related_event
    from public.character_location_events as event
    where event.id = new.related_sighting_id;

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
  end if;

  if new.publication_status = 'published' then
    if not exists (
      select 1
      from public.map_entities as character
      where character.id = new.character_id
        and character.publication_status = 'published'
    ) then
      raise exception using
        errcode = '23514',
        message = 'a published character location event requires public endpoints';
    end if;

    if new.location_entity_id is not null and not exists (
      select 1
      from public.map_entities as location
      where location.id = new.location_entity_id
        and location.publication_status = 'published'
    ) then
      raise exception using
        errcode = '23514',
        message = 'a published character location event requires public endpoints';
    end if;

    if new.geographic_name_id is not null and not exists (
      select 1
      from public.geographic_names as geographic_name
      where geographic_name.id = new.geographic_name_id
        and geographic_name.publication_status = 'published'
    ) then
      raise exception using
        errcode = '23514',
        message = 'a published character location event requires public endpoints';
    end if;

    if new.related_sighting_id is not null
       and related_event.publication_status <> 'published' then
      raise exception using
        errcode = '23514',
        message = 'a published departure requires a published related sighting';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.validate_geographic_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entity_id is not null and not exists (
    select 1
    from public.map_entities as entity
    where entity.id = new.entity_id
      and entity.entity_type = 'location'
  ) then
    raise exception using
      errcode = '23514',
      message = 'a geographic name may only link to a location entity';
  end if;

  if new.publication_status = 'published'
     and new.entity_id is not null
     and not exists (
       select 1
       from public.map_entities as entity
       where entity.id = new.entity_id
         and entity.publication_status = 'published'
     ) then
    raise exception using
      errcode = '23514',
      message = 'a published geographic name requires a published linked entity';
  end if;

  return new;
end;
$$;

create or replace function private.protect_published_tag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.publication_status = 'published'
     and new.publication_status <> 'published'
     and (
       exists (
         select 1
         from public.entity_tags as entity_tag
         where entity_tag.tag_id = old.id
           and entity_tag.publication_status = 'published'
       )
       or exists (
         select 1
         from public.public_note_tags as note_tag
         where note_tag.tag_id = old.id
           and note_tag.publication_status = 'published'
       )
     ) then
    raise exception using
      errcode = '23514',
      message = 'a tag used by published relations cannot be withdrawn';
  end if;

  return new;
end;
$$;

create function private.enforce_geographic_search_name_uniqueness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
begin
  if new.publication_status <> 'published' then
    return new;
  end if;

  if tg_table_name = 'geographic_names' then
    candidate := new.normalized_name;
  else
    candidate := new.normalized_value;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(candidate, 1));

  if tg_table_name = 'geographic_names' then
    if exists (
      select 1
      from public.geographic_name_aliases as alias
      where alias.publication_status = 'published'
        and alias.normalized_value = candidate
    ) then
      raise exception using
        errcode = '23505',
        message = 'published geographic names and aliases must be unambiguous';
    end if;
  else
    if exists (
      select 1
      from public.geographic_names as geographic_name
      where geographic_name.publication_status = 'published'
        and geographic_name.normalized_name = candidate
    ) then
      raise exception using
        errcode = '23505',
        message = 'published geographic names and aliases must be unambiguous';
    end if;
  end if;

  return new;
end;
$$;

insert into public.entity_player_dispositions (entity_id, player_id)
select entity.id, player.id
from public.map_entities as entity
cross join public.players as player
on conflict do nothing;

create trigger "10_normalize_player" before insert or update on public.players
for each row execute function private.normalize_player();
create trigger "40_player_lifecycle" before insert or update on public.players
for each row execute function private.enforce_publication_lifecycle();
create trigger "50_player_slug" before update on public.players
for each row execute function private.enforce_slug_immutability();
create trigger "60_player_identifier" before insert or update on public.players
for each row execute function private.enforce_reserved_identifier('player_id', 'player_slug');
create trigger "70_player_reserve" after insert or update on public.players
for each row execute function private.reserve_identifiers_after_publication('player_id', 'player_slug');
create trigger "80_player_delete" before delete on public.players
for each row execute function private.prevent_published_physical_delete();
create trigger "90_player_updated_at" before update on public.players
for each row execute function private.set_updated_at();
create trigger "95_player_matrix" after insert on public.players
for each row execute function private.ensure_entity_player_dispositions();

create trigger "90_entity_player_disposition_updated_at"
before update on public.entity_player_dispositions
for each row execute function private.set_updated_at();

create trigger "95_map_entity_player_matrix" after insert on public.map_entities
for each row execute function private.ensure_entity_player_dispositions();

create trigger "10_normalize_geographic_name_alias"
before insert or update on public.geographic_name_aliases
for each row execute function private.normalize_geographic_name_alias();
create trigger "20_validate_geographic_name_alias"
before insert or update on public.geographic_name_aliases
for each row execute function private.validate_geographic_name_alias();
create trigger "30_validate_geographic_name_alias_uniqueness"
before insert or update on public.geographic_name_aliases
for each row execute function private.enforce_geographic_search_name_uniqueness();
create trigger "40_geographic_name_alias_lifecycle"
before insert or update on public.geographic_name_aliases
for each row execute function private.enforce_publication_lifecycle();
create trigger "60_geographic_name_alias_identifier"
before insert or update on public.geographic_name_aliases
for each row execute function private.enforce_reserved_identifier('geographic_name_alias_id', '');
create trigger "70_geographic_name_alias_reserve"
after insert or update on public.geographic_name_aliases
for each row execute function private.reserve_identifiers_after_publication('geographic_name_alias_id', '');
create trigger "80_geographic_name_alias_delete"
before delete on public.geographic_name_aliases
for each row execute function private.prevent_published_physical_delete();
create trigger "90_geographic_name_alias_updated_at"
before update on public.geographic_name_aliases
for each row execute function private.set_updated_at();

create trigger "30_validate_geographic_name_alias_collision"
before insert or update on public.geographic_names
for each row execute function private.enforce_geographic_search_name_uniqueness();

create trigger "20_validate_public_note_tag"
before insert or update on public.public_note_tags
for each row execute function private.validate_public_note_tag();
create trigger "40_public_note_tag_lifecycle"
before insert or update on public.public_note_tags
for each row execute function private.enforce_publication_lifecycle();
create trigger "60_public_note_tag_identifier"
before insert or update on public.public_note_tags
for each row execute function private.enforce_reserved_identifier('public_note_tag_id', '');
create trigger "70_public_note_tag_reserve"
after insert or update on public.public_note_tags
for each row execute function private.reserve_identifiers_after_publication('public_note_tag_id', '');
create trigger "80_public_note_tag_delete"
before delete on public.public_note_tags
for each row execute function private.prevent_published_physical_delete();
create trigger "90_public_note_tag_updated_at"
before update on public.public_note_tags
for each row execute function private.set_updated_at();

create trigger "10_normalize_character_location_event"
before insert or update on public.character_location_events
for each row execute function private.normalize_character_location_event();
create trigger "20_validate_character_location_event"
before insert or update on public.character_location_events
for each row execute function private.validate_character_location_event();
create trigger "40_character_location_event_lifecycle"
before insert or update on public.character_location_events
for each row execute function private.enforce_publication_lifecycle();
create trigger "60_character_location_event_identifier"
before insert or update on public.character_location_events
for each row execute function private.enforce_reserved_identifier('character_location_event_id', '');
create trigger "70_character_location_event_reserve"
after insert or update on public.character_location_events
for each row execute function private.reserve_identifiers_after_publication('character_location_event_id', '');
create trigger "80_character_location_event_delete"
before delete on public.character_location_events
for each row execute function private.prevent_published_physical_delete();
create trigger "90_character_location_event_updated_at"
before update on public.character_location_events
for each row execute function private.set_updated_at();

alter table public.players enable row level security;
alter table public.entity_player_dispositions enable row level security;
alter table public.geographic_name_aliases enable row level security;
alter table public.public_note_tags enable row level security;
alter table public.character_location_events enable row level security;

revoke all on public.players from public, anon, authenticated;
revoke all on public.entity_player_dispositions from public, anon, authenticated;
revoke all on public.geographic_name_aliases from public, anon, authenticated;
revoke all on public.public_note_tags from public, anon, authenticated;
revoke all on public.character_location_events from public, anon, authenticated;

grant select on public.players to anon, authenticated;
grant select on public.entity_player_dispositions to anon, authenticated;
grant select on public.geographic_name_aliases to anon, authenticated;
grant select on public.public_note_tags to anon, authenticated;
grant select on public.character_location_events to anon, authenticated;

grant insert (id, slug, display_name, name_language, publication_status)
on public.players to authenticated;
grant update (slug, display_name, name_language, publication_status)
on public.players to authenticated;
grant delete on public.players to authenticated;

grant update (disposition)
on public.entity_player_dispositions to authenticated;

grant insert (
  id,
  geographic_name_id,
  language,
  value,
  publication_status
)
on public.geographic_name_aliases to authenticated;
grant update (
  geographic_name_id,
  language,
  value,
  publication_status
)
on public.geographic_name_aliases to authenticated;
grant delete on public.geographic_name_aliases to authenticated;

grant insert (id, note_id, tag_id, publication_status)
on public.public_note_tags to authenticated;
grant update (note_id, tag_id, publication_status)
on public.public_note_tags to authenticated;
grant delete on public.public_note_tags to authenticated;

grant insert (
  id,
  character_id,
  event_type,
  location_entity_id,
  geographic_name_id,
  x,
  y,
  location_label,
  summary,
  language,
  observed_at,
  related_sighting_id,
  publication_status
)
on public.character_location_events to authenticated;
grant update (
  character_id,
  event_type,
  location_entity_id,
  geographic_name_id,
  x,
  y,
  location_label,
  summary,
  language,
  observed_at,
  related_sighting_id,
  publication_status
)
on public.character_location_events to authenticated;
grant delete on public.character_location_events to authenticated;

grant insert (visibility, name_language)
on public.map_entities to authenticated;
grant update (visibility, name_language)
on public.map_entities to authenticated;

create policy players_public_select
on public.players
for select
to anon, authenticated
using (publication_status = 'published');

create policy players_admin_select
on public.players
for select
to authenticated
using ((select private.is_admin()));

create policy players_admin_insert
on public.players
for insert
to authenticated
with check ((select private.is_admin()));

create policy players_admin_update
on public.players
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy players_admin_delete
on public.players
for delete
to authenticated
using ((select private.is_admin()));

create policy entity_player_dispositions_public_select
on public.entity_player_dispositions
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.map_entities as entity
    join public.players as player
      on player.id = entity_player_dispositions.player_id
    where entity.id = entity_player_dispositions.entity_id
      and entity.publication_status = 'published'
      and player.publication_status = 'published'
  )
);

create policy entity_player_dispositions_admin_select
on public.entity_player_dispositions
for select
to authenticated
using ((select private.is_admin()));

create policy entity_player_dispositions_admin_update
on public.entity_player_dispositions
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy geographic_name_aliases_public_select
on public.geographic_name_aliases
for select
to anon, authenticated
using (
  publication_status = 'published'
  and exists (
    select 1
    from public.geographic_names as geographic_name
    where geographic_name.id = geographic_name_aliases.geographic_name_id
      and geographic_name.publication_status = 'published'
  )
);

create policy geographic_name_aliases_admin_select
on public.geographic_name_aliases
for select
to authenticated
using ((select private.is_admin()));

create policy geographic_name_aliases_admin_insert
on public.geographic_name_aliases
for insert
to authenticated
with check ((select private.is_admin()));

create policy geographic_name_aliases_admin_update
on public.geographic_name_aliases
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy geographic_name_aliases_admin_delete
on public.geographic_name_aliases
for delete
to authenticated
using ((select private.is_admin()));

create policy public_note_tags_public_select
on public.public_note_tags
for select
to anon, authenticated
using (
  publication_status = 'published'
  and exists (
    select 1
    from public.public_notes as note
    join public.map_entities as entity
      on entity.id = note.entity_id
    join public.tags as tag
      on tag.id = public_note_tags.tag_id
    where note.id = public_note_tags.note_id
      and note.publication_status = 'published'
      and entity.publication_status = 'published'
      and tag.publication_status = 'published'
  )
);

create policy public_note_tags_admin_select
on public.public_note_tags
for select
to authenticated
using ((select private.is_admin()));

create policy public_note_tags_admin_insert
on public.public_note_tags
for insert
to authenticated
with check ((select private.is_admin()));

create policy public_note_tags_admin_update
on public.public_note_tags
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy public_note_tags_admin_delete
on public.public_note_tags
for delete
to authenticated
using ((select private.is_admin()));

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
);

create policy character_location_events_admin_select
on public.character_location_events
for select
to authenticated
using ((select private.is_admin()));

create policy character_location_events_admin_insert
on public.character_location_events
for insert
to authenticated
with check ((select private.is_admin()));

create policy character_location_events_admin_update
on public.character_location_events
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy character_location_events_admin_delete
on public.character_location_events
for delete
to authenticated
using ((select private.is_admin()));
