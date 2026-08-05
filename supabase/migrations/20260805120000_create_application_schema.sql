-- MAP-014: physical data model and database invariants for Beta 0.2.

create schema if not exists private;

revoke all on schema private from public;
revoke create on schema public from public, anon, authenticated;

create extension if not exists unaccent with schema extensions;

create type public.entity_type as enum (
  'character',
  'location'
);

create type public.disposition as enum (
  'ally',
  'enemy',
  'neutral',
  'unknown'
);

create type public.publication_status as enum (
  'draft',
  'published',
  'archived'
);

create type public.request_status as enum (
  'pending',
  'accepted',
  'rejected',
  'converted',
  'archived'
);

create table private.reserved_public_identifiers (
  namespace text not null,
  value text not null,
  reserved_at timestamp with time zone not null default timezone('utc', now()),
  primary key (namespace, value),
  constraint reserved_public_identifiers_namespace_check
    check (namespace ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint reserved_public_identifiers_value_check
    check (char_length(value) between 1 and 160)
);

create table public.categories (
  id text primary key,
  slug text not null unique,
  name text not null,
  description text not null default '',
  publication_status public.publication_status not null default 'draft',
  published_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint categories_id_check
    check (id ~ '^category-[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint categories_slug_check
    check (slug ~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint categories_name_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint categories_description_check
    check (char_length(description) <= 1000)
);

create table public.tags (
  id text primary key,
  name text not null,
  description text not null default '',
  publication_status public.publication_status not null default 'draft',
  published_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint tags_id_check
    check (id ~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint tags_name_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint tags_description_check
    check (char_length(description) <= 1000)
);

create table public.map_entities (
  id text primary key,
  slug text not null unique,
  entity_type public.entity_type not null,
  disposition public.disposition not null default 'unknown',
  name text not null,
  normalized_name text not null,
  summary text not null default '',
  description text not null default '',
  x double precision not null,
  y double precision not null,
  category_id text not null references public.categories (id)
    on update restrict on delete restrict,
  publication_status public.publication_status not null default 'draft',
  published_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint map_entities_id_check
    check (id ~ '^(entity|place)-[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint map_entities_slug_check
    check (slug ~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint map_entities_name_check
    check (char_length(btrim(name)) between 1 and 160),
  constraint map_entities_normalized_name_check
    check (char_length(normalized_name) between 1 and 160),
  constraint map_entities_summary_check
    check (char_length(summary) <= 500),
  constraint map_entities_description_check
    check (char_length(description) <= 5000),
  constraint map_entities_x_check
    check (
      x between 0 and 3600
      and x not in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    ),
  constraint map_entities_y_check
    check (
      y between 0 and 2329
      and y not in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    ),
  constraint map_entities_location_disposition_check
    check (entity_type = 'character' or disposition = 'unknown')
);

create table public.entity_aliases (
  id text primary key,
  entity_id text not null references public.map_entities (id)
    on update restrict on delete restrict,
  language text not null default 'en',
  value text not null,
  normalized_value text not null,
  publication_status public.publication_status not null default 'draft',
  published_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint entity_aliases_id_check
    check (id ~ '^alias-[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint entity_aliases_language_check
    check (language = 'en'),
  constraint entity_aliases_value_check
    check (char_length(btrim(value)) between 1 and 160),
  constraint entity_aliases_normalized_value_check
    check (char_length(normalized_value) between 1 and 160),
  constraint entity_aliases_entity_normalized_unique
    unique (entity_id, normalized_value)
);

create table public.entity_tags (
  id text primary key,
  entity_id text not null references public.map_entities (id)
    on update restrict on delete restrict,
  tag_id text not null references public.tags (id)
    on update restrict on delete restrict,
  publication_status public.publication_status not null default 'draft',
  published_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint entity_tags_id_check
    check (id ~ '^entity-tag-[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint entity_tags_pair_unique
    unique (entity_id, tag_id)
);

create table public.public_notes (
  id text primary key,
  slug text not null unique,
  entity_id text not null references public.map_entities (id)
    on update restrict on delete restrict,
  title text not null,
  body text not null,
  sort_order integer not null default 0,
  publication_status public.publication_status not null default 'draft',
  published_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint public_notes_id_check
    check (id ~ '^note-[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint public_notes_slug_check
    check (slug ~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint public_notes_title_check
    check (char_length(btrim(title)) between 1 and 160),
  constraint public_notes_body_check
    check (char_length(body) between 1 and 5000),
  constraint public_notes_sort_order_check
    check (sort_order >= 0),
  constraint public_notes_entity_sort_unique
    unique (entity_id, sort_order)
);

create table public.character_locations (
  id text primary key,
  character_id text not null references public.map_entities (id)
    on update restrict on delete restrict,
  location_id text not null references public.map_entities (id)
    on update restrict on delete restrict,
  label text,
  sort_order integer not null default 0,
  publication_status public.publication_status not null default 'draft',
  published_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint character_locations_id_check
    check (id ~ '^relation-[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint character_locations_different_endpoints_check
    check (character_id <> location_id),
  constraint character_locations_label_check
    check (label is null or char_length(btrim(label)) between 1 and 160),
  constraint character_locations_sort_order_check
    check (sort_order >= 0),
  constraint character_locations_pair_unique
    unique (character_id, location_id)
);

create table public.geographic_names (
  id text primary key,
  slug text not null unique,
  name text not null,
  normalized_name text not null,
  aliases text[] not null default '{}',
  language text not null default 'en',
  x double precision not null,
  y double precision not null,
  recommended_zoom double precision,
  entity_id text references public.map_entities (id)
    on update restrict on delete restrict,
  publication_status public.publication_status not null default 'draft',
  published_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint geographic_names_id_check
    check (id ~ '^geo-[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint geographic_names_slug_check
    check (slug ~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint geographic_names_name_check
    check (char_length(btrim(name)) between 1 and 160),
  constraint geographic_names_normalized_name_check
    check (char_length(normalized_name) between 1 and 160),
  constraint geographic_names_aliases_check
    check (
      cardinality(aliases) <= 20
      and array_position(aliases, null) is null
      and array_position(aliases, '') is null
    ),
  constraint geographic_names_language_check
    check (language = 'en'),
  constraint geographic_names_x_check
    check (
      x between 0 and 3600
      and x not in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    ),
  constraint geographic_names_y_check
    check (
      y between 0 and 2329
      and y not in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    ),
  constraint geographic_names_zoom_check
    check (
      recommended_zoom is null
      or (
        recommended_zoom between -5 and 10
        and recommended_zoom not in (
          'NaN'::double precision,
          'Infinity'::double precision,
          '-Infinity'::double precision
        )
      )
    )
);

create table public.public_requests (
  id uuid primary key default gen_random_uuid(),
  sender_name text not null,
  proposed_name text not null,
  entity_type public.entity_type not null,
  x double precision not null,
  y double precision not null,
  description text not null,
  reason text not null,
  request_status public.request_status not null default 'pending',
  moderator_user_id uuid references auth.users (id)
    on update restrict on delete restrict,
  moderation_note text,
  converted_entity_id text references public.map_entities (id)
    on update restrict on delete restrict,
  moderated_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint public_requests_sender_name_check
    check (char_length(btrim(sender_name)) between 1 and 80),
  constraint public_requests_proposed_name_check
    check (char_length(btrim(proposed_name)) between 1 and 160),
  constraint public_requests_x_check
    check (
      x between 0 and 3600
      and x not in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    ),
  constraint public_requests_y_check
    check (
      y between 0 and 2329
      and y not in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    ),
  constraint public_requests_description_check
    check (char_length(btrim(description)) between 1 and 2000),
  constraint public_requests_reason_check
    check (char_length(btrim(reason)) between 1 and 1000),
  constraint public_requests_moderation_note_check
    check (moderation_note is null or char_length(moderation_note) <= 2000),
  constraint public_requests_moderation_fields_check
    check (
      (
        request_status = 'pending'
        and moderator_user_id is null
        and moderation_note is null
        and converted_entity_id is null
        and moderated_at is null
      )
      or (
        request_status <> 'pending'
        and moderator_user_id is not null
        and moderated_at is not null
      )
    ),
  constraint public_requests_conversion_check
    check (
      converted_entity_id is null
      or request_status in ('converted', 'archived')
    )
);

create index map_entities_category_id_idx on public.map_entities (category_id);
create index map_entities_publication_status_idx on public.map_entities (publication_status);
create index entity_aliases_entity_id_idx on public.entity_aliases (entity_id);
create index entity_tags_entity_id_idx on public.entity_tags (entity_id);
create index entity_tags_tag_id_idx on public.entity_tags (tag_id);
create index public_notes_entity_id_idx on public.public_notes (entity_id);
create index character_locations_character_id_idx on public.character_locations (character_id);
create index character_locations_location_id_idx on public.character_locations (location_id);
create index geographic_names_entity_id_idx on public.geographic_names (entity_id);
create index public_requests_status_created_idx on public.public_requests (request_status, created_at);

create unique index map_entities_published_normalized_name_uidx
  on public.map_entities (normalized_name)
  where publication_status = 'published';

create unique index entity_aliases_published_normalized_value_uidx
  on public.entity_aliases (normalized_value)
  where publication_status = 'published';

create unique index geographic_names_published_normalized_name_uidx
  on public.geographic_names (normalized_name)
  where publication_status = 'published';

create function private.normalize_search_text(input_value text)
returns text
language sql
stable
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        lower(extensions.unaccent(coalesce(input_value, ''))),
        '[^a-z0-9]+',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

create function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create function private.enforce_publication_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.published_at is not null and new.published_at is distinct from old.published_at then
      raise exception using errcode = '23514', message = 'published_at is immutable after first publication';
    end if;

    if old.publication_status = 'archived' and new.publication_status not in ('archived', 'draft') then
      raise exception using errcode = '23514', message = 'archived content must return to draft before publication';
    end if;
  end if;

  if new.publication_status = 'published' then
    if new.published_at is null then
      new.published_at := timezone('utc', now());
    end if;
    new.archived_at := null;
  elsif new.publication_status = 'archived' then
    if new.archived_at is null then
      new.archived_at := timezone('utc', now());
    end if;
  else
    new.archived_at := null;
  end if;

  return new;
end;
$$;

create function private.enforce_slug_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.published_at is not null and new.slug is distinct from old.slug then
    raise exception using errcode = '23514', message = 'a slug cannot change after first publication';
  end if;

  return new;
end;
$$;

create function private.enforce_reserved_identifier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  id_namespace text := tg_argv[0];
  slug_namespace text := nullif(tg_argv[1], '');
  new_id text := to_jsonb(new) ->> 'id';
  old_id text := case when tg_op = 'UPDATE' then to_jsonb(old) ->> 'id' end;
  new_slug text := to_jsonb(new) ->> 'slug';
  old_slug text := case when tg_op = 'UPDATE' then to_jsonb(old) ->> 'slug' end;
begin
  if tg_op = 'UPDATE' and new_id is distinct from old_id then
    raise exception using errcode = '23514', message = 'public identifiers are immutable';
  end if;

  if tg_op = 'INSERT' and exists (
    select 1 from private.reserved_public_identifiers as reserved
    where reserved.namespace = id_namespace and reserved.value = new_id
  ) then
    raise exception using errcode = '23505', message = 'the public identifier is reserved and cannot be reused';
  end if;

  if slug_namespace is not null
     and (tg_op = 'INSERT' or new_slug is distinct from old_slug)
     and exists (
       select 1 from private.reserved_public_identifiers as reserved
       where reserved.namespace = slug_namespace and reserved.value = new_slug
     ) then
    raise exception using errcode = '23505', message = 'the public slug is reserved and cannot be reused';
  end if;

  return new;
end;
$$;

create function private.reserve_identifiers_after_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  id_namespace text := tg_argv[0];
  slug_namespace text := nullif(tg_argv[1], '');
  new_id text := to_jsonb(new) ->> 'id';
  new_slug text := to_jsonb(new) ->> 'slug';
  became_public boolean := new.published_at is not null and (tg_op = 'INSERT' or old.published_at is null);
begin
  if not became_public then
    return new;
  end if;

  insert into private.reserved_public_identifiers (namespace, value)
  values (id_namespace, new_id)
  on conflict do nothing;

  if slug_namespace is not null then
    insert into private.reserved_public_identifiers (namespace, value)
    values (slug_namespace, new_slug)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create function private.prevent_published_physical_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.published_at is not null then
    raise exception using errcode = '23514', message = 'published content cannot be physically deleted by the application';
  end if;

  return old;
end;
$$;

create function private.normalize_map_entity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.normalized_name := private.normalize_search_text(new.name);
  new.summary := btrim(new.summary);
  new.description := btrim(new.description);
  return new;
end;
$$;

create function private.normalize_entity_alias()
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

create function private.normalize_geographic_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.normalized_name := private.normalize_search_text(new.name);
  return new;
end;
$$;

create function private.enforce_public_name_uniqueness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_value text;
begin
  if new.publication_status <> 'published' then
    return new;
  end if;

  if tg_table_name = 'map_entities' then
    normalized_value := new.normalized_name;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(normalized_value, 0));

    if exists (
      select 1 from public.entity_aliases as alias
      where alias.publication_status = 'published' and alias.normalized_value = normalized_value
    ) then
      raise exception using errcode = '23505', message = 'published names and aliases must be unambiguous';
    end if;
  else
    normalized_value := new.normalized_value;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(normalized_value, 0));

    if exists (
      select 1 from public.map_entities as entity
      where entity.publication_status = 'published' and entity.normalized_name = normalized_value
    ) then
      raise exception using errcode = '23505', message = 'published names and aliases must be unambiguous';
    end if;
  end if;

  return new;
end;
$$;

create function private.validate_map_entity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.entity_type is distinct from old.entity_type then
    raise exception using errcode = '23514', message = 'entity_type is immutable';
  end if;

  if new.publication_status = 'published' and not exists (
    select 1 from public.categories as category
    where category.id = new.category_id and category.publication_status = 'published'
  ) then
    raise exception using errcode = '23514', message = 'a published entity requires a published category';
  end if;

  return new;
end;
$$;

create function private.validate_entity_alias()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.publication_status = 'published' and not exists (
    select 1 from public.map_entities as entity
    where entity.id = new.entity_id and entity.publication_status = 'published'
  ) then
    raise exception using errcode = '23514', message = 'a published alias requires a published entity';
  end if;

  return new;
end;
$$;

create function private.validate_entity_tag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.publication_status = 'published' and not exists (
    select 1
    from public.map_entities as entity
    join public.tags as tag on tag.id = new.tag_id
    where entity.id = new.entity_id
      and entity.publication_status = 'published'
      and tag.publication_status = 'published'
  ) then
    raise exception using errcode = '23514', message = 'a published entity tag requires published endpoints';
  end if;

  return new;
end;
$$;

create function private.validate_public_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.publication_status = 'published' and not exists (
    select 1 from public.map_entities as entity
    where entity.id = new.entity_id and entity.publication_status = 'published'
  ) then
    raise exception using errcode = '23514', message = 'a published note requires a published entity';
  end if;

  return new;
end;
$$;

create function private.validate_character_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.map_entities as character
    join public.map_entities as location on location.id = new.location_id
    where character.id = new.character_id
      and character.entity_type = 'character'
      and location.entity_type = 'location'
  ) then
    raise exception using errcode = '23514', message = 'character location endpoints have invalid entity types';
  end if;

  if new.publication_status = 'published' and not exists (
    select 1
    from public.map_entities as character
    join public.map_entities as location on location.id = new.location_id
    where character.id = new.character_id
      and character.publication_status = 'published'
      and location.publication_status = 'published'
  ) then
    raise exception using errcode = '23514', message = 'a published character location requires published endpoints';
  end if;

  return new;
end;
$$;

create function private.validate_geographic_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.publication_status = 'published' and new.entity_id is not null and not exists (
    select 1 from public.map_entities as entity
    where entity.id = new.entity_id and entity.publication_status = 'published'
  ) then
    raise exception using errcode = '23514', message = 'a published geographic name requires a published linked entity';
  end if;

  return new;
end;
$$;

create function private.protect_published_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.publication_status = 'published'
     and new.publication_status <> 'published'
     and exists (
       select 1 from public.map_entities as entity
       where entity.category_id = old.id and entity.publication_status = 'published'
     ) then
    raise exception using errcode = '23514', message = 'a category used by published entities cannot be withdrawn';
  end if;

  return new;
end;
$$;

create function private.protect_published_tag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.publication_status = 'published'
     and new.publication_status <> 'published'
     and exists (
       select 1 from public.entity_tags as entity_tag
       where entity_tag.tag_id = old.id and entity_tag.publication_status = 'published'
     ) then
    raise exception using errcode = '23514', message = 'a tag used by published relations cannot be withdrawn';
  end if;

  return new;
end;
$$;

create function private.validate_request_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  valid_transition boolean;
begin
  new.sender_name := btrim(new.sender_name);
  new.proposed_name := btrim(new.proposed_name);
  new.description := btrim(new.description);
  new.reason := btrim(new.reason);
  new.moderation_note := nullif(btrim(new.moderation_note), '');

  if tg_op = 'INSERT' then
    if new.request_status <> 'pending'
       or new.moderator_user_id is not null
       or new.moderation_note is not null
       or new.converted_entity_id is not null
       or new.moderated_at is not null then
      raise exception using errcode = '23514', message = 'new public requests must start pending without moderation fields';
    end if;

    return new;
  end if;

  if new.request_status = old.request_status then
    return new;
  end if;

  valid_transition := case old.request_status
    when 'pending' then new.request_status in ('accepted', 'rejected', 'archived')
    when 'accepted' then new.request_status in ('converted', 'rejected', 'archived')
    when 'rejected' then new.request_status = 'archived'
    when 'converted' then new.request_status = 'archived'
    when 'archived' then false
    else false
  end;

  if not valid_transition then
    raise exception using errcode = '23514', message = 'invalid public request status transition';
  end if;

  if new.moderator_user_id is null then
    new.moderator_user_id := auth.uid();
  end if;

  if new.moderated_at is null then
    new.moderated_at := timezone('utc', now());
  end if;

  if new.request_status = 'converted' and new.converted_entity_id is null then
    raise exception using errcode = '23514', message = 'a converted request requires a target entity';
  end if;

  return new;
end;
$$;

create trigger "10_normalize_map_entity" before insert or update on public.map_entities
for each row execute function private.normalize_map_entity();
create trigger "20_validate_map_entity" before insert or update on public.map_entities
for each row execute function private.validate_map_entity();
create trigger "30_validate_map_entity_public_name" before insert or update on public.map_entities
for each row execute function private.enforce_public_name_uniqueness();
create trigger "40_map_entity_lifecycle" before insert or update on public.map_entities
for each row execute function private.enforce_publication_lifecycle();
create trigger "50_map_entity_slug" before update on public.map_entities
for each row execute function private.enforce_slug_immutability();
create trigger "60_map_entity_identifier" before insert or update on public.map_entities
for each row execute function private.enforce_reserved_identifier('map_entity_id', 'map_entity_slug');
create trigger "70_map_entity_reserve" after insert or update on public.map_entities
for each row execute function private.reserve_identifiers_after_publication('map_entity_id', 'map_entity_slug');
create trigger "80_map_entity_delete" before delete on public.map_entities
for each row execute function private.prevent_published_physical_delete();
create trigger "90_map_entity_updated_at" before update on public.map_entities
for each row execute function private.set_updated_at();

create trigger "20_category_protect" before update on public.categories
for each row execute function private.protect_published_category();
create trigger "40_category_lifecycle" before insert or update on public.categories
for each row execute function private.enforce_publication_lifecycle();
create trigger "50_category_slug" before update on public.categories
for each row execute function private.enforce_slug_immutability();
create trigger "60_category_identifier" before insert or update on public.categories
for each row execute function private.enforce_reserved_identifier('category_id', 'category_slug');
create trigger "70_category_reserve" after insert or update on public.categories
for each row execute function private.reserve_identifiers_after_publication('category_id', 'category_slug');
create trigger "80_category_delete" before delete on public.categories
for each row execute function private.prevent_published_physical_delete();
create trigger "90_category_updated_at" before update on public.categories
for each row execute function private.set_updated_at();

create trigger "20_tag_protect" before update on public.tags
for each row execute function private.protect_published_tag();
create trigger "40_tag_lifecycle" before insert or update on public.tags
for each row execute function private.enforce_publication_lifecycle();
create trigger "60_tag_identifier" before insert or update on public.tags
for each row execute function private.enforce_reserved_identifier('tag_id', '');
create trigger "70_tag_reserve" after insert or update on public.tags
for each row execute function private.reserve_identifiers_after_publication('tag_id', '');
create trigger "80_tag_delete" before delete on public.tags
for each row execute function private.prevent_published_physical_delete();
create trigger "90_tag_updated_at" before update on public.tags
for each row execute function private.set_updated_at();

create trigger "10_normalize_entity_alias" before insert or update on public.entity_aliases
for each row execute function private.normalize_entity_alias();
create trigger "20_validate_entity_alias" before insert or update on public.entity_aliases
for each row execute function private.validate_entity_alias();
create trigger "30_validate_entity_alias_public_name" before insert or update on public.entity_aliases
for each row execute function private.enforce_public_name_uniqueness();
create trigger "40_entity_alias_lifecycle" before insert or update on public.entity_aliases
for each row execute function private.enforce_publication_lifecycle();
create trigger "60_entity_alias_identifier" before insert or update on public.entity_aliases
for each row execute function private.enforce_reserved_identifier('entity_alias_id', '');
create trigger "70_entity_alias_reserve" after insert or update on public.entity_aliases
for each row execute function private.reserve_identifiers_after_publication('entity_alias_id', '');
create trigger "80_entity_alias_delete" before delete on public.entity_aliases
for each row execute function private.prevent_published_physical_delete();
create trigger "90_entity_alias_updated_at" before update on public.entity_aliases
for each row execute function private.set_updated_at();

create trigger "20_validate_entity_tag" before insert or update on public.entity_tags
for each row execute function private.validate_entity_tag();
create trigger "40_entity_tag_lifecycle" before insert or update on public.entity_tags
for each row execute function private.enforce_publication_lifecycle();
create trigger "60_entity_tag_identifier" before insert or update on public.entity_tags
for each row execute function private.enforce_reserved_identifier('entity_tag_id', '');
create trigger "70_entity_tag_reserve" after insert or update on public.entity_tags
for each row execute function private.reserve_identifiers_after_publication('entity_tag_id', '');
create trigger "80_entity_tag_delete" before delete on public.entity_tags
for each row execute function private.prevent_published_physical_delete();
create trigger "90_entity_tag_updated_at" before update on public.entity_tags
for each row execute function private.set_updated_at();

create trigger "20_validate_public_note" before insert or update on public.public_notes
for each row execute function private.validate_public_note();
create trigger "40_public_note_lifecycle" before insert or update on public.public_notes
for each row execute function private.enforce_publication_lifecycle();
create trigger "50_public_note_slug" before update on public.public_notes
for each row execute function private.enforce_slug_immutability();
create trigger "60_public_note_identifier" before insert or update on public.public_notes
for each row execute function private.enforce_reserved_identifier('public_note_id', 'public_note_slug');
create trigger "70_public_note_reserve" after insert or update on public.public_notes
for each row execute function private.reserve_identifiers_after_publication('public_note_id', 'public_note_slug');
create trigger "80_public_note_delete" before delete on public.public_notes
for each row execute function private.prevent_published_physical_delete();
create trigger "90_public_note_updated_at" before update on public.public_notes
for each row execute function private.set_updated_at();

create trigger "20_validate_character_location" before insert or update on public.character_locations
for each row execute function private.validate_character_location();
create trigger "40_character_location_lifecycle" before insert or update on public.character_locations
for each row execute function private.enforce_publication_lifecycle();
create trigger "60_character_location_identifier" before insert or update on public.character_locations
for each row execute function private.enforce_reserved_identifier('character_location_id', '');
create trigger "70_character_location_reserve" after insert or update on public.character_locations
for each row execute function private.reserve_identifiers_after_publication('character_location_id', '');
create trigger "80_character_location_delete" before delete on public.character_locations
for each row execute function private.prevent_published_physical_delete();
create trigger "90_character_location_updated_at" before update on public.character_locations
for each row execute function private.set_updated_at();

create trigger "10_normalize_geographic_name" before insert or update on public.geographic_names
for each row execute function private.normalize_geographic_name();
create trigger "20_validate_geographic_name" before insert or update on public.geographic_names
for each row execute function private.validate_geographic_name();
create trigger "40_geographic_name_lifecycle" before insert or update on public.geographic_names
for each row execute function private.enforce_publication_lifecycle();
create trigger "50_geographic_name_slug" before update on public.geographic_names
for each row execute function private.enforce_slug_immutability();
create trigger "60_geographic_name_identifier" before insert or update on public.geographic_names
for each row execute function private.enforce_reserved_identifier('geographic_name_id', 'geographic_name_slug');
create trigger "70_geographic_name_reserve" after insert or update on public.geographic_names
for each row execute function private.reserve_identifiers_after_publication('geographic_name_id', 'geographic_name_slug');
create trigger "80_geographic_name_delete" before delete on public.geographic_names
for each row execute function private.prevent_published_physical_delete();
create trigger "90_geographic_name_updated_at" before update on public.geographic_names
for each row execute function private.set_updated_at();

create trigger "20_validate_public_request" before insert or update on public.public_requests
for each row execute function private.validate_request_transition();
create trigger "90_public_request_updated_at" before update on public.public_requests
for each row execute function private.set_updated_at();

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
