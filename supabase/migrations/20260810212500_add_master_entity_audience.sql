-- MAP-044: server-authoritative audience for entities visible only to the Máster.
--
-- This is a forward-only migration. Existing rows remain public by default. Public
-- Data API readers must never receive master rows or dependent data. Administrative
-- reads/writes continue to be authorized by private.is_admin() and RLS.

create type public.entity_audience as enum (
  'public',
  'master'
);

alter table public.map_entities
  add column audience public.entity_audience not null default 'public';

comment on column public.map_entities.audience is
  'MAP-044 audience boundary. public is player-safe; master requires an authorized admin read.';

-- The browser may supply audience only as an authenticated identity. Existing admin
-- RLS remains authoritative, so authenticated non-admin users still affect zero rows.
grant insert (audience) on public.map_entities to authenticated;
grant update (audience) on public.map_entities to authenticated;

-- Public entity rows must be both published and explicitly player-safe.
drop policy if exists map_entities_public_select on public.map_entities;
create policy map_entities_public_select
on public.map_entities
for select
to anon, authenticated
using (
  publication_status = 'published'
  and audience = 'public'
  and exists (
    select 1
    from public.categories as category
    where category.id = map_entities.category_id
      and category.publication_status = 'published'
  )
);

-- Every dependent public projection is fail-closed through the entity audience.
drop policy if exists entity_aliases_public_select on public.entity_aliases;
create policy entity_aliases_public_select
on public.entity_aliases
for select
to anon, authenticated
using (
  publication_status = 'published'
  and exists (
    select 1
    from public.map_entities as entity
    where entity.id = entity_aliases.entity_id
      and entity.publication_status = 'published'
      and entity.audience = 'public'
  )
);

drop policy if exists entity_tags_public_select on public.entity_tags;
create policy entity_tags_public_select
on public.entity_tags
for select
to anon, authenticated
using (
  publication_status = 'published'
  and exists (
    select 1
    from public.map_entities as entity
    join public.tags as tag
      on tag.id = entity_tags.tag_id
    where entity.id = entity_tags.entity_id
      and entity.publication_status = 'published'
      and entity.audience = 'public'
      and tag.publication_status = 'published'
  )
);

drop policy if exists public_notes_public_select on public.public_notes;
create policy public_notes_public_select
on public.public_notes
for select
to anon, authenticated
using (
  publication_status = 'published'
  and exists (
    select 1
    from public.map_entities as entity
    where entity.id = public_notes.entity_id
      and entity.publication_status = 'published'
      and entity.audience = 'public'
  )
);

drop policy if exists geographic_names_public_select on public.geographic_names;
create policy geographic_names_public_select
on public.geographic_names
for select
to anon, authenticated
using (
  publication_status = 'published'
  and (
    entity_id is null
    or exists (
      select 1
      from public.map_entities as entity
      where entity.id = geographic_names.entity_id
        and entity.publication_status = 'published'
        and entity.audience = 'public'
    )
  )
);

drop policy if exists entity_player_dispositions_public_select on public.entity_player_dispositions;
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
      and entity.audience = 'public'
      and player.publication_status = 'published'
  )
);

drop policy if exists geographic_name_aliases_public_select on public.geographic_name_aliases;
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
      and (
        geographic_name.entity_id is null
        or exists (
          select 1
          from public.map_entities as entity
          where entity.id = geographic_name.entity_id
            and entity.publication_status = 'published'
            and entity.audience = 'public'
        )
      )
  )
);

drop policy if exists public_note_tags_public_select on public.public_note_tags;
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
      and entity.audience = 'public'
      and tag.publication_status = 'published'
  )
);

drop policy if exists character_location_events_public_select on public.character_location_events;
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
      and character.audience = 'public'
  )
  and (
    location_entity_id is null
    or exists (
      select 1
      from public.map_entities as location
      where location.id = character_location_events.location_entity_id
        and location.publication_status = 'published'
        and location.audience = 'public'
    )
  )
  and (
    geographic_name_id is null
    or exists (
      select 1
      from public.geographic_names as geographic_name
      where geographic_name.id = character_location_events.geographic_name_id
        and geographic_name.publication_status = 'published'
        and (
          geographic_name.entity_id is null
          or exists (
            select 1
            from public.map_entities as linked_entity
            where linked_entity.id = geographic_name.entity_id
              and linked_entity.publication_status = 'published'
              and linked_entity.audience = 'public'
          )
        )
    )
  )
);

drop policy if exists character_location_relations_public_select on public.character_location_relations;
create policy character_location_relations_public_select
on public.character_location_relations
for select
to anon, authenticated
using (
  publication_status = 'published'
  and exists (
    select 1
    from public.map_entities as character
    where character.id = character_location_relations.character_id
      and character.entity_type = 'character'
      and character.publication_status = 'published'
      and character.audience = 'public'
  )
  and exists (
    select 1
    from public.map_entities as location
    where location.id = character_location_relations.location_id
      and location.entity_type = 'location'
      and location.publication_status = 'published'
      and location.audience = 'public'
  )
);

-- Versioned administrative read contract. The original MAP-019 function remains
-- admin-only for backwards compatibility but does not expose audience. New clients
-- use this wrapper, which adds audience without weakening the authorization boundary.
create function public.admin_get_map_entity_editor_v2(p_entity_id text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  base_result jsonb;
  entity_audience public.entity_audience;
begin
  if not public.current_user_is_admin() then
    raise exception using
      errcode = '42501',
      message = 'administrative authorization required';
  end if;

  base_result := public.admin_get_map_entity_editor(p_entity_id);
  if base_result is null then
    return null;
  end if;

  select entity.audience
  into entity_audience
  from public.map_entities as entity
  where entity.id = p_entity_id;

  return pg_catalog.jsonb_set(
    base_result,
    '{record}',
    (base_result -> 'record') || pg_catalog.jsonb_build_object('audience', entity_audience),
    false
  );
end;
$$;

-- Versioned atomic save contract. It delegates the established MAP-019 mutation and
-- changes audience inside the same database transaction. Both paths use the same
-- SECURITY INVOKER/RLS/admin authorization boundary; the v1 overload cannot modify
-- audience and therefore cannot grant private access.
create function public.admin_save_map_entity_v2(
  p_id text,
  p_expected_updated_at timestamptz,
  p_expected_relations_revision text,
  p_slug text,
  p_entity_type public.entity_type,
  p_visibility public.map_visibility,
  p_audience public.entity_audience,
  p_name text,
  p_summary text,
  p_description text,
  p_x double precision,
  p_y double precision,
  p_category_id text,
  p_publication_status public.publication_status,
  p_tag_ids text[],
  p_dispositions jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.current_user_is_admin() then
    raise exception using
      errcode = '42501',
      message = 'administrative authorization required';
  end if;

  perform public.admin_save_map_entity(
    p_id,
    p_expected_updated_at,
    p_expected_relations_revision,
    p_slug,
    p_entity_type,
    p_visibility,
    p_name,
    p_summary,
    p_description,
    p_x,
    p_y,
    p_category_id,
    p_publication_status,
    p_tag_ids,
    p_dispositions
  );

  update public.map_entities as entity
  set audience = p_audience
  where entity.id = p_id
    and entity.audience is distinct from p_audience;

  if not found and not exists (
    select 1 from public.map_entities as entity where entity.id = p_id
  ) then
    raise exception using
      errcode = '40001',
      message = 'the entity changed while its audience was being saved';
  end if;

  return public.admin_get_map_entity_editor_v2(p_id);
end;
$$;

revoke all on function public.admin_get_map_entity_editor_v2(text) from public, anon;
grant execute on function public.admin_get_map_entity_editor_v2(text) to authenticated;

revoke all on function public.admin_save_map_entity_v2(
  text,
  timestamptz,
  text,
  text,
  public.entity_type,
  public.map_visibility,
  public.entity_audience,
  text,
  text,
  text,
  double precision,
  double precision,
  text,
  public.publication_status,
  text[],
  jsonb
) from public, anon;
grant execute on function public.admin_save_map_entity_v2(
  text,
  timestamptz,
  text,
  text,
  public.entity_type,
  public.map_visibility,
  public.entity_audience,
  text,
  text,
  text,
  double precision,
  double precision,
  text,
  public.publication_status,
  text[],
  jsonb
) to authenticated;

comment on function public.admin_get_map_entity_editor_v2(text) is
  'MAP-044 admin-only entity editor snapshot including audience; SECURITY INVOKER and RLS protected.';
comment on function public.admin_save_map_entity_v2(
  text,
  timestamptz,
  text,
  text,
  public.entity_type,
  public.map_visibility,
  public.entity_audience,
  text,
  text,
  text,
  double precision,
  double precision,
  text,
  public.publication_status,
  text[],
  jsonb
) is
  'MAP-044 atomic admin entity save including audience; delegates MAP-019 save and remains SECURITY INVOKER/RLS protected.';
