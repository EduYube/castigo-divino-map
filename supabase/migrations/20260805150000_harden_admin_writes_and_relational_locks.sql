-- MAP-014: harden browser writes and serialize strict publication invariants.
-- The four preceding migrations are already applied and remain immutable.

create or replace function private.enforce_publication_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.publication_status = 'archived'
     and new.publication_status not in ('archived', 'draft') then
    raise exception using
      errcode = '23514',
      message = 'archived content must return to draft before publication';
  end if;

  if tg_op = 'INSERT' then
    if new.publication_status = 'published' then
      new.published_at := timezone('utc', now());
      new.archived_at := null;
    elsif new.publication_status = 'archived' then
      new.published_at := null;
      new.archived_at := timezone('utc', now());
    else
      new.published_at := null;
      new.archived_at := null;
    end if;

    return new;
  end if;

  if new.publication_status = 'published' then
    new.published_at := coalesce(old.published_at, timezone('utc', now()));
    new.archived_at := null;
  elsif new.publication_status = 'archived' then
    new.published_at := old.published_at;
    new.archived_at := case
      when old.publication_status = 'archived' and old.archived_at is not null
        then old.archived_at
      else timezone('utc', now())
    end;
  else
    new.published_at := old.published_at;
    new.archived_at := null;
  end if;

  return new;
end;
$$;

create or replace function private.validate_map_entity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.entity_type is distinct from old.entity_type then
    raise exception using errcode = '23514', message = 'entity_type is immutable';
  end if;

  if new.publication_status = 'published' then
    perform 1
    from public.categories as category
    where category.id = new.category_id
      and category.publication_status = 'published'
    for share;

    if not found then
      raise exception using
        errcode = '23514',
        message = 'a published entity requires a published category';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.validate_entity_tag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.publication_status = 'published' then
    if not exists (
      select 1
      from public.map_entities as entity
      where entity.id = new.entity_id
        and entity.publication_status = 'published'
    ) then
      raise exception using
        errcode = '23514',
        message = 'a published entity tag requires published endpoints';
    end if;

    perform 1
    from public.tags as tag
    where tag.id = new.tag_id
      and tag.publication_status = 'published'
    for share;

    if not found then
      raise exception using
        errcode = '23514',
        message = 'a published entity tag requires published endpoints';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.validate_request_transition()
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
    new.request_status := 'pending';
    new.moderator_user_id := null;
    new.moderation_note := null;
    new.converted_entity_id := null;
    new.moderated_at := null;
    return new;
  end if;

  if new.request_status = old.request_status then
    new.moderator_user_id := old.moderator_user_id;
    new.moderated_at := old.moderated_at;
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

  new.moderator_user_id := auth.uid();
  new.moderated_at := timezone('utc', now());

  if new.request_status = 'converted' and new.converted_entity_id is null then
    raise exception using errcode = '23514', message = 'a converted request requires a target entity';
  end if;

  return new;
end;
$$;

-- RLS chooses which rows an administrator may mutate. Column privileges define
-- which fields the untrusted browser is allowed to supply.
revoke insert, update on public.categories from authenticated;
revoke insert, update on public.tags from authenticated;
revoke insert, update on public.map_entities from authenticated;
revoke insert, update on public.entity_aliases from authenticated;
revoke insert, update on public.entity_tags from authenticated;
revoke insert, update on public.public_notes from authenticated;
revoke insert, update on public.character_locations from authenticated;
revoke insert, update on public.geographic_names from authenticated;
revoke update on public.public_requests from authenticated;

grant insert (id, slug, name, description, publication_status)
on public.categories to authenticated;
grant update (slug, name, description, publication_status)
on public.categories to authenticated;

grant insert (id, name, description, publication_status)
on public.tags to authenticated;
grant update (name, description, publication_status)
on public.tags to authenticated;

grant insert (
  id,
  slug,
  entity_type,
  disposition,
  name,
  summary,
  description,
  x,
  y,
  category_id,
  publication_status
)
on public.map_entities to authenticated;
grant update (
  slug,
  disposition,
  name,
  summary,
  description,
  x,
  y,
  category_id,
  publication_status
)
on public.map_entities to authenticated;

grant insert (id, entity_id, language, value, publication_status)
on public.entity_aliases to authenticated;
grant update (entity_id, language, value, publication_status)
on public.entity_aliases to authenticated;

grant insert (id, entity_id, tag_id, publication_status)
on public.entity_tags to authenticated;
grant update (entity_id, tag_id, publication_status)
on public.entity_tags to authenticated;

grant insert (id, slug, entity_id, title, body, sort_order, publication_status)
on public.public_notes to authenticated;
grant update (slug, entity_id, title, body, sort_order, publication_status)
on public.public_notes to authenticated;

grant insert (
  id,
  character_id,
  location_id,
  label,
  sort_order,
  publication_status
)
on public.character_locations to authenticated;
grant update (
  character_id,
  location_id,
  label,
  sort_order,
  publication_status
)
on public.character_locations to authenticated;

grant insert (
  id,
  slug,
  name,
  aliases,
  language,
  x,
  y,
  recommended_zoom,
  entity_id,
  publication_status
)
on public.geographic_names to authenticated;
grant update (
  slug,
  name,
  aliases,
  language,
  x,
  y,
  recommended_zoom,
  entity_id,
  publication_status
)
on public.geographic_names to authenticated;

grant update (request_status, moderation_note, converted_entity_id)
on public.public_requests to authenticated;
