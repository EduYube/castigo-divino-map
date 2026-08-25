begin;

-- New domain tables are deny-by-default in the preceding migration. Install
-- explicit least-privilege grants and RLS now.
grant select on table public.campaigns to anon, authenticated;
grant insert (id, slug, name, status, display_order, archived_at) on table public.campaigns to authenticated;
grant update (name, status, display_order, archived_at) on table public.campaigns to authenticated;

grant select on table public.campaign_geographic_entity_links to anon, authenticated;
grant insert (campaign_id, geographic_name_id, entity_id) on table public.campaign_geographic_entity_links to authenticated;
grant update (entity_id) on table public.campaign_geographic_entity_links to authenticated;
grant delete on table public.campaign_geographic_entity_links to authenticated;

-- Existing admin INSERT surfaces gain only the new immutable campaign selector.
-- UPDATE is intentionally not granted: campaign scope cannot be moved in place.
grant insert (campaign_id) on table public.categories to authenticated;
grant insert (campaign_id) on table public.tags to authenticated;
grant insert (campaign_id) on table public.players to authenticated;
grant insert (campaign_id) on table public.map_entities to authenticated;
grant insert (campaign_id) on table public.entity_aliases to authenticated;
grant insert (campaign_id) on table public.entity_tags to authenticated;
grant insert (campaign_id) on table public.public_notes to authenticated;
grant insert (campaign_id) on table public.public_note_tags to authenticated;
grant insert (campaign_id) on table public.character_location_relations to authenticated;
grant insert (campaign_id) on table public.character_location_events to authenticated;

create policy campaigns_public_select
on public.campaigns
for select
to anon, authenticated
using (status = 'active');

create policy campaigns_admin_select
on public.campaigns
for select
to authenticated
using ((select private.is_admin()));

create policy campaigns_admin_insert
on public.campaigns
for insert
to authenticated
with check ((select private.is_admin()));

create policy campaigns_admin_update
on public.campaigns
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy campaign_geographic_entity_links_public_select
on public.campaign_geographic_entity_links
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.campaigns campaign
    where campaign.id = campaign_geographic_entity_links.campaign_id
      and campaign.status = 'active'
  )
  and exists (
    select 1
    from public.geographic_names geographic_name
    where geographic_name.id = campaign_geographic_entity_links.geographic_name_id
      and geographic_name.publication_status = 'published'::public.publication_status
  )
  and exists (
    select 1
    from public.map_entities entity
    where entity.id = campaign_geographic_entity_links.entity_id
      and entity.campaign_id = campaign_geographic_entity_links.campaign_id
      and entity.publication_status = 'published'::public.publication_status
      and entity.audience = 'public'::public.entity_audience
  )
);

create policy campaign_geographic_entity_links_admin_select
on public.campaign_geographic_entity_links
for select
to authenticated
using ((select private.is_admin()));

create policy campaign_geographic_entity_links_admin_insert
on public.campaign_geographic_entity_links
for insert
to authenticated
with check ((select private.is_admin()));

create policy campaign_geographic_entity_links_admin_update
on public.campaign_geographic_entity_links
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy campaign_geographic_entity_links_admin_delete
on public.campaign_geographic_entity_links
for delete
to authenticated
using ((select private.is_admin()));

-- Campaign-scoped public projections require an active campaign and enforce
-- same-campaign joins explicitly, even where composite foreign keys already do.
drop policy if exists categories_public_select on public.categories;
create policy categories_public_select
on public.categories
for select
to anon, authenticated
using (
  publication_status = 'published'::public.publication_status
  and exists (
    select 1 from public.campaigns campaign
    where campaign.id = categories.campaign_id and campaign.status = 'active'
  )
);

drop policy if exists tags_public_select on public.tags;
create policy tags_public_select
on public.tags
for select
to anon, authenticated
using (
  publication_status = 'published'::public.publication_status
  and exists (
    select 1 from public.campaigns campaign
    where campaign.id = tags.campaign_id and campaign.status = 'active'
  )
);

drop policy if exists players_public_select on public.players;
create policy players_public_select
on public.players
for select
to anon, authenticated
using (
  publication_status = 'published'::public.publication_status
  and exists (
    select 1 from public.campaigns campaign
    where campaign.id = players.campaign_id and campaign.status = 'active'
  )
);

drop policy if exists map_entities_public_select on public.map_entities;
create policy map_entities_public_select
on public.map_entities
for select
to anon, authenticated
using (
  publication_status = 'published'::public.publication_status
  and audience = 'public'::public.entity_audience
  and exists (
    select 1 from public.campaigns campaign
    where campaign.id = map_entities.campaign_id and campaign.status = 'active'
  )
  and (
    category_id is null
    or exists (
      select 1
      from public.categories category
      where category.id = map_entities.category_id
        and category.campaign_id = map_entities.campaign_id
        and category.publication_status = 'published'::public.publication_status
    )
  )
);

drop policy if exists entity_aliases_public_select on public.entity_aliases;
create policy entity_aliases_public_select
on public.entity_aliases
for select
to anon, authenticated
using (
  publication_status = 'published'::public.publication_status
  and exists (
    select 1
    from public.map_entities entity
    where entity.id = entity_aliases.entity_id
      and entity.campaign_id = entity_aliases.campaign_id
      and entity.publication_status = 'published'::public.publication_status
      and entity.audience = 'public'::public.entity_audience
  )
);

drop policy if exists entity_tags_public_select on public.entity_tags;
create policy entity_tags_public_select
on public.entity_tags
for select
to anon, authenticated
using (
  publication_status = 'published'::public.publication_status
  and exists (
    select 1
    from public.map_entities entity
    join public.tags tag
      on tag.id = entity_tags.tag_id
     and tag.campaign_id = entity_tags.campaign_id
    where entity.id = entity_tags.entity_id
      and entity.campaign_id = entity_tags.campaign_id
      and entity.publication_status = 'published'::public.publication_status
      and entity.audience = 'public'::public.entity_audience
      and tag.publication_status = 'published'::public.publication_status
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
    from public.map_entities entity
    join public.players player
      on player.id = entity_player_dispositions.player_id
     and player.campaign_id = entity_player_dispositions.campaign_id
    where entity.id = entity_player_dispositions.entity_id
      and entity.campaign_id = entity_player_dispositions.campaign_id
      and entity.publication_status = 'published'::public.publication_status
      and entity.audience = 'public'::public.entity_audience
      and player.publication_status = 'published'::public.publication_status
  )
);

drop policy if exists public_notes_public_select on public.public_notes;
create policy public_notes_public_select
on public.public_notes
for select
to anon, authenticated
using (
  publication_status = 'published'::public.publication_status
  and exists (
    select 1
    from public.map_entities entity
    where entity.id = public_notes.entity_id
      and entity.campaign_id = public_notes.campaign_id
      and entity.publication_status = 'published'::public.publication_status
      and entity.audience = 'public'::public.entity_audience
  )
);

drop policy if exists public_note_tags_public_select on public.public_note_tags;
create policy public_note_tags_public_select
on public.public_note_tags
for select
to anon, authenticated
using (
  publication_status = 'published'::public.publication_status
  and exists (
    select 1
    from public.public_notes note
    join public.map_entities entity
      on entity.id = note.entity_id
     and entity.campaign_id = note.campaign_id
    join public.tags tag
      on tag.id = public_note_tags.tag_id
     and tag.campaign_id = public_note_tags.campaign_id
    where note.id = public_note_tags.note_id
      and note.campaign_id = public_note_tags.campaign_id
      and note.publication_status = 'published'::public.publication_status
      and entity.publication_status = 'published'::public.publication_status
      and entity.audience = 'public'::public.entity_audience
      and tag.publication_status = 'published'::public.publication_status
  )
);

drop policy if exists character_location_relations_public_select on public.character_location_relations;
create policy character_location_relations_public_select
on public.character_location_relations
for select
to anon, authenticated
using (
  publication_status = 'published'::public.publication_status
  and exists (
    select 1
    from public.map_entities character
    join public.map_entities location
      on location.id = character_location_relations.location_id
     and location.campaign_id = character_location_relations.campaign_id
    where character.id = character_location_relations.character_id
      and character.campaign_id = character_location_relations.campaign_id
      and character.entity_type = 'character'::public.entity_type
      and character.publication_status = 'published'::public.publication_status
      and character.audience = 'public'::public.entity_audience
      and location.entity_type = 'location'::public.entity_type
      and location.publication_status = 'published'::public.publication_status
      and location.audience = 'public'::public.entity_audience
  )
);

drop policy if exists character_location_events_public_select on public.character_location_events;
create policy character_location_events_public_select
on public.character_location_events
for select
to anon, authenticated
using (
  publication_status = 'published'::public.publication_status
  and exists (
    select 1 from public.campaigns campaign
    where campaign.id = character_location_events.campaign_id and campaign.status = 'active'
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
);

-- Geographic names and aliases are universal map-base data after the legacy
-- entity relationship has been migrated out and constrained to NULL.
drop policy if exists geographic_names_public_select on public.geographic_names;
create policy geographic_names_public_select
on public.geographic_names
for select
to anon, authenticated
using (publication_status = 'published'::public.publication_status);

drop policy if exists geographic_name_aliases_public_select on public.geographic_name_aliases;
create policy geographic_name_aliases_public_select
on public.geographic_name_aliases
for select
to anon, authenticated
using (
  publication_status = 'published'::public.publication_status
  and exists (
    select 1
    from public.geographic_names geographic_name
    where geographic_name.id = geographic_name_aliases.geographic_name_id
      and geographic_name.publication_status = 'published'::public.publication_status
  )
);

-- Campaign-aware public request ingress. The old v1.0 signature remains an
-- explicit initial-campaign compatibility API; v1.1 callers can choose scope.
create or replace function public.submit_public_request_v2(
  p_campaign_id uuid,
  p_sender_name text,
  p_proposed_name text,
  p_entity_type public.entity_type,
  p_x double precision,
  p_y double precision,
  p_description text,
  p_reason text,
  p_honeypot text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender_name_value text := pg_catalog.btrim(p_sender_name);
  proposed_name_value text := pg_catalog.btrim(p_proposed_name);
  description_value text := pg_catalog.btrim(p_description);
  reason_value text := pg_catalog.btrim(p_reason);
begin
  if pg_catalog.nullif(pg_catalog.btrim(p_honeypot), '') is not null then
    return true;
  end if;

  if not exists (
    select 1 from public.campaigns campaign
    where campaign.id = p_campaign_id and campaign.status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'invalid campaign';
  end if;

  if pg_catalog.char_length(sender_name_value) not between 1 and 80
     or pg_catalog.char_length(proposed_name_value) not between 1 and 160
     or pg_catalog.char_length(description_value) not between 1 and 2000
     or pg_catalog.char_length(reason_value) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid public request';
  end if;

  if p_x not between 0 and 3600
     or p_x in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
     or p_y not between 0 and 2329
     or p_y in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision) then
    raise exception using errcode = '22023', message = 'invalid public request';
  end if;

  insert into public.public_requests (
    campaign_id,
    sender_name,
    proposed_name,
    entity_type,
    x,
    y,
    description,
    reason,
    request_status,
    moderator_user_id,
    moderation_note,
    converted_entity_id,
    moderated_at
  ) values (
    p_campaign_id,
    sender_name_value,
    proposed_name_value,
    p_entity_type,
    p_x,
    p_y,
    description_value,
    reason_value,
    'pending',
    null,
    null,
    null,
    null
  );

  return true;
end;
$$;

revoke all on function public.submit_public_request_v2(
  uuid, text, text, public.entity_type, double precision, double precision, text, text, text
) from public;
grant execute on function public.submit_public_request_v2(
  uuid, text, text, public.entity_type, double precision, double precision, text, text, text
) to anon, authenticated;

create or replace function public.submit_public_request(
  p_sender_name text,
  p_proposed_name text,
  p_entity_type public.entity_type,
  p_x double precision,
  p_y double precision,
  p_description text,
  p_reason text,
  p_honeypot text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.submit_public_request_v2(
    '00000000-0000-4000-8000-000000000053'::uuid,
    p_sender_name,
    p_proposed_name,
    p_entity_type,
    p_x,
    p_y,
    p_description,
    p_reason,
    p_honeypot
  );
end;
$$;

revoke all on function public.submit_public_request(
  text, text, public.entity_type, double precision, double precision, text, text, text
) from public;
grant execute on function public.submit_public_request(
  text, text, public.entity_type, double precision, double precision, text, text, text
) to anon, authenticated;

-- Conversion preserves request scope. CREATE OR REPLACE keeps the dedicated
-- atlas_public_request_moderator owner and the hardened EXECUTE ACL from MAP-027.
create or replace function public.admin_moderate_public_request(
  p_request_id uuid,
  p_expected_updated_at timestamptz,
  p_action text,
  p_moderation_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.public_requests%rowtype;
  result_record public.public_requests%rowtype;
  normalized_note text := pg_catalog.nullif(pg_catalog.btrim(p_moderation_note), '');
  draft_entity_id text;
  draft_slug text;
begin
  if not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'administrative authorization required';
  end if;

  if p_action is null or p_action not in ('reject', 'convert') then
    raise exception using errcode = '23514', message = 'unsupported public request moderation action';
  end if;

  select request.*
  into request_record
  from public.public_requests as request
  where request.id = p_request_id
  for update;

  if not found
     or request_record.request_status <> 'pending'
     or p_expected_updated_at is null
     or request_record.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'public request changed or was already processed';
  end if;

  if p_action = 'reject' then
    update public.public_requests as request
    set request_status = 'rejected', moderation_note = normalized_note
    where request.id = p_request_id
    returning request.* into result_record;

    return pg_catalog.jsonb_build_object(
      'request', pg_catalog.to_jsonb(result_record),
      'draft_entity_id', null
    );
  end if;

  draft_entity_id := 'entity-request-' || pg_catalog.replace(p_request_id::text, '-', '');
  draft_slug := 'request-' || pg_catalog.replace(p_request_id::text, '-', '');

  insert into public.map_entities (
    campaign_id,
    id,
    slug,
    entity_type,
    visibility,
    name,
    name_language,
    summary,
    description,
    x,
    y,
    category_id,
    publication_status
  ) values (
    request_record.campaign_id,
    draft_entity_id,
    draft_slug,
    request_record.entity_type,
    'pin',
    request_record.proposed_name,
    'en',
    '',
    request_record.description,
    request_record.x,
    request_record.y,
    null,
    'draft'
  );

  update public.public_requests as request
  set request_status = 'accepted', moderation_note = normalized_note
  where request.id = p_request_id;

  update public.public_requests as request
  set request_status = 'converted',
      converted_entity_id = draft_entity_id,
      moderation_note = normalized_note
  where request.id = p_request_id
  returning request.* into result_record;

  return pg_catalog.jsonb_build_object(
    'request', pg_catalog.to_jsonb(result_record),
    'draft_entity_id', draft_entity_id
  );
end;
$$;

-- Defensive ACL restatement: never inherit PostgreSQL's default PUBLIC execute.
revoke all on function public.admin_moderate_public_request(uuid, timestamptz, text, text) from public, anon;
grant execute on function public.admin_moderate_public_request(uuid, timestamptz, text, text) to authenticated;

commit;
