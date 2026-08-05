-- MAP-015: contract legacy entity fields and lock published relation identity.
-- The six preceding migrations are immutable and remain the complete history.

create function private.enforce_relation_identity_after_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  argument_index integer;
  column_name text;
begin
  if tg_op <> 'UPDATE' or old.published_at is null then
    return new;
  end if;

  if tg_nargs = 0 then
    return new;
  end if;

  for argument_index in 0..tg_nargs - 1 loop
    column_name := tg_argv[argument_index];

    if (to_jsonb(new) -> column_name) is distinct from (to_jsonb(old) -> column_name) then
      raise exception using
        errcode = '23514',
        message = 'published relation identity is immutable';
    end if;
  end loop;

  return new;
end;
$$;

create trigger "25_entity_alias_identity"
before update on public.entity_aliases
for each row execute function private.enforce_relation_identity_after_publication('entity_id');

create trigger "25_entity_tag_identity"
before update on public.entity_tags
for each row execute function private.enforce_relation_identity_after_publication('entity_id', 'tag_id');

create trigger "25_public_note_identity"
before update on public.public_notes
for each row execute function private.enforce_relation_identity_after_publication('entity_id');

create trigger "25_geographic_name_identity"
before update on public.geographic_names
for each row execute function private.enforce_relation_identity_after_publication('entity_id');

create trigger "25_geographic_name_alias_identity"
before update on public.geographic_name_aliases
for each row execute function private.enforce_relation_identity_after_publication('geographic_name_id');

create trigger "25_public_note_tag_identity"
before update on public.public_note_tags
for each row execute function private.enforce_relation_identity_after_publication('note_id', 'tag_id');

create trigger "25_character_location_event_identity"
before update on public.character_location_events
for each row execute function private.enforce_relation_identity_after_publication(
  'character_id',
  'event_type',
  'location_entity_id',
  'geographic_name_id',
  'x',
  'y',
  'language',
  'observed_at',
  'related_sighting_id'
);

create or replace function private.validate_request_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  valid_transition boolean;
  target_entity public.map_entities%rowtype;
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
    if new.converted_entity_id is distinct from old.converted_entity_id then
      raise exception using
        errcode = '23514',
        message = 'a converted request target is immutable';
    end if;

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
    raise exception using
      errcode = '23514',
      message = 'invalid public request status transition';
  end if;

  if old.request_status = 'converted' then
    new.converted_entity_id := old.converted_entity_id;
  elsif new.request_status <> 'converted' then
    new.converted_entity_id := old.converted_entity_id;
  end if;

  new.moderator_user_id := auth.uid();
  new.moderated_at := timezone('utc', now());

  if new.request_status = 'converted' then
    if new.converted_entity_id is null then
      raise exception using
        errcode = '23514',
        message = 'a converted request requires a target entity';
    end if;

    select *
    into target_entity
    from public.map_entities as entity
    where entity.id = new.converted_entity_id
    for share;

    if not found
       or target_entity.entity_type <> new.entity_type
       or target_entity.publication_status <> 'draft'
       or target_entity.visibility <> 'pin' then
      raise exception using
        errcode = '23514',
        message = 'a converted request requires a matching draft pin entity';
    end if;
  end if;

  return new;
end;
$$;

create function private.prevent_moderated_request_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.request_status <> 'pending' or old.moderated_at is not null then
    raise exception using
      errcode = '23514',
      message = 'moderated public requests cannot be physically deleted';
  end if;

  return old;
end;
$$;

create unique index public_requests_converted_entity_id_uidx
  on public.public_requests (converted_entity_id)
  where converted_entity_id is not null;

create trigger "80_public_request_delete"
before delete on public.public_requests
for each row execute function private.prevent_moderated_request_delete();

drop table public.character_locations;

drop function private.validate_character_location();

alter table public.geographic_names
  drop column aliases;

alter table public.map_entities
  drop column disposition;

drop type public.disposition;

revoke insert, update on public.map_entities from authenticated;

grant insert (
  id,
  slug,
  entity_type,
  visibility,
  name_language,
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
  visibility,
  name_language,
  name,
  summary,
  description,
  x,
  y,
  category_id,
  publication_status
)
on public.map_entities to authenticated;

revoke insert, update on public.geographic_names from authenticated;

grant insert (
  id,
  slug,
  name,
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
  language,
  x,
  y,
  recommended_zoom,
  entity_id,
  publication_status
)
on public.geographic_names to authenticated;
