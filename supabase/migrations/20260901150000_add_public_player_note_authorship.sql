begin;

-- MAP-063: public notes can be authored declaratively by a published player,
-- while administrative authorship is always derived from the authenticated session.
create type public.public_note_author_kind as enum ('master', 'player');

alter table public.public_notes
  add column author_kind public.public_note_author_kind,
  add column author_player_id text,
  add column last_modifier_kind public.public_note_author_kind,
  add column last_modifier_player_id text;

-- v1.0 notes were authored and curated by the Master. Preserve every existing
-- identifier, content field, tag relation and timestamp; only attach historical
-- authorship metadata.
update public.public_notes
set author_kind = 'master'::public.public_note_author_kind,
    author_player_id = null,
    last_modifier_kind = 'master'::public.public_note_author_kind,
    last_modifier_player_id = null
where author_kind is null;

alter table public.public_notes
  alter column author_kind set not null,
  alter column last_modifier_kind set not null,
  add constraint public_notes_author_shape_check check (
    (author_kind = 'master'::public.public_note_author_kind and author_player_id is null)
    or
    (author_kind = 'player'::public.public_note_author_kind and author_player_id is not null)
  ),
  add constraint public_notes_last_modifier_shape_check check (
    (last_modifier_kind = 'master'::public.public_note_author_kind and last_modifier_player_id is null)
    or
    (last_modifier_kind = 'player'::public.public_note_author_kind and last_modifier_player_id is not null)
  ),
  add constraint public_notes_author_player_campaign_fk
    foreign key (author_player_id, campaign_id)
    references public.players (id, campaign_id)
    on update restrict on delete restrict,
  add constraint public_notes_last_modifier_player_campaign_fk
    foreign key (last_modifier_player_id, campaign_id)
    references public.players (id, campaign_id)
    on update restrict on delete restrict;

create index public_notes_player_rate_limit_idx
  on public.public_notes (campaign_id, entity_id, author_player_id, created_at desc)
  where author_kind = 'player'::public.public_note_author_kind;

-- MAP-063 closes direct note mutation completely. Administration also uses the
-- narrow RPCs below so original authorship cannot be mass-assigned by a client.
revoke insert, update, delete on table public.public_notes from anon, authenticated;
revoke insert (id, slug, entity_id, title, body, sort_order, publication_status, campaign_id)
  on table public.public_notes from authenticated;
revoke update (slug, entity_id, title, body, sort_order, publication_status, campaign_id)
  on table public.public_notes from authenticated;

drop policy if exists public_notes_admin_insert on public.public_notes;
drop policy if exists public_notes_admin_update on public.public_notes;
drop policy if exists public_notes_admin_delete on public.public_notes;

create or replace function public.create_public_player_note(
  p_entity_id text,
  p_player_id text,
  p_title text,
  p_body text
)
returns table (
  id text,
  slug text,
  entity_id text,
  title text,
  body text,
  sort_order integer,
  author_kind public.public_note_author_kind,
  author_player_id text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  last_modifier_kind public.public_note_author_kind,
  last_modifier_player_id text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  entity_row public.map_entities%rowtype;
  title_value text := pg_catalog.btrim(p_title);
  body_value text := pg_catalog.btrim(p_body);
  note_id text;
  note_slug text;
  next_sort_order integer;
  recent_player_count integer;
  recent_entity_count integer;
begin
  -- Lock the public entity before validation and sort-order allocation. Missing,
  -- draft, archived and Master-only targets deliberately share one error.
  select entity.*
  into entity_row
  from public.map_entities as entity
  join public.campaigns as campaign
    on campaign.id = entity.campaign_id
   and campaign.status = 'active'
  where entity.id = p_entity_id
    and entity.publication_status = 'published'::public.publication_status
    and entity.audience = 'public'::public.entity_audience
  for update of entity;

  if not found then
    raise exception using errcode = '22023', message = 'public note target unavailable';
  end if;

  if not exists (
    select 1
    from public.players as player
    where player.id = p_player_id
      and player.campaign_id = entity_row.campaign_id
      and player.publication_status = 'published'::public.publication_status
  ) then
    raise exception using errcode = '22023', message = 'invalid public note author';
  end if;

  if pg_catalog.char_length(title_value) not between 1 and 160
     or pg_catalog.char_length(body_value) not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'invalid public note content';
  end if;

  select pg_catalog.count(*)::integer
  into recent_player_count
  from public.public_notes as note
  where note.campaign_id = entity_row.campaign_id
    and note.entity_id = entity_row.id
    and note.author_kind = 'player'::public.public_note_author_kind
    and note.author_player_id = p_player_id
    and note.created_at >= pg_catalog.now() - interval '10 minutes';

  select pg_catalog.count(*)::integer
  into recent_entity_count
  from public.public_notes as note
  where note.campaign_id = entity_row.campaign_id
    and note.entity_id = entity_row.id
    and note.author_kind = 'player'::public.public_note_author_kind
    and note.created_at >= pg_catalog.now() - interval '10 minutes';

  if recent_player_count >= 5 or recent_entity_count >= 15 then
    raise exception using errcode = '54000', message = 'public note rate limit exceeded';
  end if;

  select coalesce(pg_catalog.max(note.sort_order), -1) + 1
  into next_sort_order
  from public.public_notes as note
  where note.entity_id = entity_row.id;

  note_id := 'note-' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
  note_slug := note_id;

  return query
  insert into public.public_notes as note (
    id,
    slug,
    entity_id,
    campaign_id,
    title,
    body,
    sort_order,
    publication_status,
    published_at,
    archived_at,
    author_kind,
    author_player_id,
    last_modifier_kind,
    last_modifier_player_id
  ) values (
    note_id,
    note_slug,
    entity_row.id,
    entity_row.campaign_id,
    title_value,
    body_value,
    next_sort_order,
    'published'::public.publication_status,
    pg_catalog.now(),
    null,
    'player'::public.public_note_author_kind,
    p_player_id,
    'player'::public.public_note_author_kind,
    p_player_id
  )
  returning
    note.id,
    note.slug,
    note.entity_id,
    note.title,
    note.body,
    note.sort_order,
    note.author_kind,
    note.author_player_id,
    note.created_at,
    note.updated_at,
    note.last_modifier_kind,
    note.last_modifier_player_id;
end;
$$;

revoke all on function public.create_public_player_note(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_public_player_note(text, text, text, text)
  to anon, authenticated;

create or replace function public.create_master_public_note(
  p_entity_id text,
  p_title text,
  p_body text
)
returns table (
  id text,
  slug text,
  entity_id text,
  title text,
  body text,
  sort_order integer,
  author_kind public.public_note_author_kind,
  author_player_id text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  last_modifier_kind public.public_note_author_kind,
  last_modifier_player_id text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  entity_row public.map_entities%rowtype;
  title_value text := pg_catalog.btrim(p_title);
  body_value text := pg_catalog.btrim(p_body);
  note_id text;
  next_sort_order integer;
begin
  if not private.is_admin() then
    raise exception using errcode = '42501', message = 'administrative authorization required';
  end if;

  select entity.*
  into entity_row
  from public.map_entities as entity
  join public.campaigns as campaign
    on campaign.id = entity.campaign_id
   and campaign.status = 'active'
  where entity.id = p_entity_id
    and entity.publication_status = 'published'::public.publication_status
    and entity.audience = 'public'::public.entity_audience
  for update of entity;

  if not found then
    raise exception using errcode = '22023', message = 'public note target unavailable';
  end if;

  if pg_catalog.char_length(title_value) not between 1 and 160
     or pg_catalog.char_length(body_value) not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'invalid public note content';
  end if;

  select coalesce(pg_catalog.max(note.sort_order), -1) + 1
  into next_sort_order
  from public.public_notes as note
  where note.entity_id = entity_row.id;

  note_id := 'note-' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');

  return query
  insert into public.public_notes as note (
    id,
    slug,
    entity_id,
    campaign_id,
    title,
    body,
    sort_order,
    publication_status,
    published_at,
    archived_at,
    author_kind,
    author_player_id,
    last_modifier_kind,
    last_modifier_player_id
  ) values (
    note_id,
    note_id,
    entity_row.id,
    entity_row.campaign_id,
    title_value,
    body_value,
    next_sort_order,
    'published'::public.publication_status,
    pg_catalog.now(),
    null,
    'master'::public.public_note_author_kind,
    null,
    'master'::public.public_note_author_kind,
    null
  )
  returning
    note.id,
    note.slug,
    note.entity_id,
    note.title,
    note.body,
    note.sort_order,
    note.author_kind,
    note.author_player_id,
    note.created_at,
    note.updated_at,
    note.last_modifier_kind,
    note.last_modifier_player_id;
end;
$$;

revoke all on function public.create_master_public_note(text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_master_public_note(text, text, text)
  to authenticated;

create or replace function public.update_master_public_note(
  p_entity_id text,
  p_note_id text,
  p_title text,
  p_body text
)
returns table (
  id text,
  slug text,
  entity_id text,
  title text,
  body text,
  sort_order integer,
  author_kind public.public_note_author_kind,
  author_player_id text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  last_modifier_kind public.public_note_author_kind,
  last_modifier_player_id text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  title_value text := pg_catalog.btrim(p_title);
  body_value text := pg_catalog.btrim(p_body);
begin
  if not private.is_admin() then
    raise exception using errcode = '42501', message = 'administrative authorization required';
  end if;

  if pg_catalog.char_length(title_value) not between 1 and 160
     or pg_catalog.char_length(body_value) not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'invalid public note content';
  end if;

  return query
  update public.public_notes as note
  set title = title_value,
      body = body_value,
      last_modifier_kind = 'master'::public.public_note_author_kind,
      last_modifier_player_id = null
  from public.map_entities as entity
  join public.campaigns as campaign
    on campaign.id = entity.campaign_id
   and campaign.status = 'active'
  where note.id = p_note_id
    and note.entity_id = p_entity_id
    and note.entity_id = entity.id
    and note.campaign_id = entity.campaign_id
    and note.publication_status = 'published'::public.publication_status
    and entity.publication_status = 'published'::public.publication_status
    and entity.audience = 'public'::public.entity_audience
  returning
    note.id,
    note.slug,
    note.entity_id,
    note.title,
    note.body,
    note.sort_order,
    note.author_kind,
    note.author_player_id,
    note.created_at,
    note.updated_at,
    note.last_modifier_kind,
    note.last_modifier_player_id;

  if not found then
    raise exception using errcode = '22023', message = 'public note unavailable';
  end if;
end;
$$;

revoke all on function public.update_master_public_note(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.update_master_public_note(text, text, text, text)
  to authenticated;

create or replace function public.archive_master_public_note(
  p_entity_id text,
  p_note_id text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception using errcode = '42501', message = 'administrative authorization required';
  end if;

  update public.public_notes as note
  set publication_status = 'archived'::public.publication_status,
      archived_at = pg_catalog.now(),
      last_modifier_kind = 'master'::public.public_note_author_kind,
      last_modifier_player_id = null
  where note.id = p_note_id
    and note.entity_id = p_entity_id
    and note.publication_status = 'published'::public.publication_status;

  if not found then
    raise exception using errcode = '22023', message = 'public note unavailable';
  end if;

  return true;
end;
$$;

revoke all on function public.archive_master_public_note(text, text)
  from public, anon, authenticated;
grant execute on function public.archive_master_public_note(text, text)
  to authenticated;

commit;
