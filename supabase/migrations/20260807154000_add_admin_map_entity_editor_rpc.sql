-- MAP-019: atomic administrative entity editor operations.
--
-- The browser remains an untrusted SECURITY INVOKER client. RLS, column grants,
-- constraints and triggers continue to authorize and validate every table write.

create or replace function public.admin_get_map_entity_editor(p_entity_id text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
  relation_revision text;
begin
  if not public.current_user_is_admin() then
    raise exception using
      errcode = '42501',
      message = 'administrative authorization required';
  end if;

  select pg_catalog.jsonb_build_object(
    'record', pg_catalog.jsonb_build_object(
      'id', entity.id,
      'slug', entity.slug,
      'entity_type', entity.entity_type,
      'visibility', entity.visibility,
      'name', entity.name,
      'summary', entity.summary,
      'description', entity.description,
      'x', entity.x,
      'y', entity.y,
      'category_id', entity.category_id,
      'publication_status', entity.publication_status,
      'published_at', entity.published_at,
      'archived_at', entity.archived_at,
      'updated_at', entity.updated_at
    ),
    'tag_links', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', link.id,
          'tag_id', link.tag_id,
          'publication_status', link.publication_status,
          'published_at', link.published_at,
          'updated_at', link.updated_at
        ) order by link.id
      )
      from public.entity_tags as link
      where link.entity_id = entity.id
    ), '[]'::jsonb),
    'dispositions', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'player_id', relation.player_id,
          'display_name', player.display_name,
          'disposition', relation.disposition,
          'updated_at', relation.updated_at
        ) order by relation.player_id
      )
      from public.entity_player_dispositions as relation
      join public.players as player on player.id = relation.player_id
      where relation.entity_id = entity.id
    ), '[]'::jsonb),
    'delete_blockers', pg_catalog.jsonb_build_object(
      'aliases', (select pg_catalog.count(*) from public.entity_aliases as alias where alias.entity_id = entity.id),
      'tags', (select pg_catalog.count(*) from public.entity_tags as link where link.entity_id = entity.id),
      'geographic_names', (select pg_catalog.count(*) from public.geographic_names as name where name.entity_id = entity.id),
      'notes', (select pg_catalog.count(*) from public.public_notes as note where note.entity_id = entity.id),
      'location_events', (
        select pg_catalog.count(*)
        from public.character_location_events as event
        where event.character_id = entity.id or event.location_entity_id = entity.id
      ),
      'requests', (select pg_catalog.count(*) from public.public_requests as request where request.converted_entity_id = entity.id)
    )
  )
  into result
  from public.map_entities as entity
  where entity.id = p_entity_id;

  if result is null then
    return null;
  end if;

  select pg_catalog.md5(
    coalesce((
      select pg_catalog.string_agg(
        link.id || ':' || link.tag_id || ':' || link.publication_status::text || ':' || link.updated_at::text,
        '|' order by link.id
      )
      from public.entity_tags as link
      where link.entity_id = p_entity_id
    ), '') || '#' || coalesce((
      select pg_catalog.string_agg(
        relation.player_id || ':' || relation.disposition::text || ':' || relation.updated_at::text,
        '|' order by relation.player_id
      )
      from public.entity_player_dispositions as relation
      where relation.entity_id = p_entity_id
    ), '')
  )
  into relation_revision;

  return result || pg_catalog.jsonb_build_object('relations_revision', relation_revision);
end;
$$;

create or replace function public.admin_save_map_entity(
  p_id text,
  p_expected_updated_at timestamptz,
  p_expected_relations_revision text,
  p_slug text,
  p_entity_type public.entity_type,
  p_visibility public.map_visibility,
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
declare
  existing public.map_entities%rowtype;
  relation_revision text;
  selected_tag_ids text[] := coalesce(p_tag_ids, '{}'::text[]);
  disposition_count integer;
begin
  if not public.current_user_is_admin() then
    raise exception using
      errcode = '42501',
      message = 'administrative authorization required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin-map-entity:' || p_id, 0)
  );

  if p_expected_updated_at is not null then
    select entity.*
    into existing
    from public.map_entities as entity
    where entity.id = p_id
    for update;

    if not found or existing.updated_at is distinct from p_expected_updated_at then
      raise exception using
        errcode = '40001',
        message = 'the entity changed while it was being edited';
    end if;

    if existing.entity_type is distinct from p_entity_type then
      raise exception using
        errcode = '23514',
        message = 'entity_type is immutable';
    end if;

    perform 1
    from public.entity_tags as link
    where link.entity_id = p_id
    for update;

    perform 1
    from public.entity_player_dispositions as relation
    where relation.entity_id = p_id
    for update;

    select pg_catalog.md5(
      coalesce((
        select pg_catalog.string_agg(
          link.id || ':' || link.tag_id || ':' || link.publication_status::text || ':' || link.updated_at::text,
          '|' order by link.id
        )
        from public.entity_tags as link
        where link.entity_id = p_id
      ), '') || '#' || coalesce((
        select pg_catalog.string_agg(
          relation.player_id || ':' || relation.disposition::text || ':' || relation.updated_at::text,
          '|' order by relation.player_id
        )
        from public.entity_player_dispositions as relation
        where relation.entity_id = p_id
      ), '')
    )
    into relation_revision;

    if p_expected_relations_revision is null
       or relation_revision is distinct from p_expected_relations_revision then
      raise exception using
        errcode = '40001',
        message = 'entity relations changed while the editor was open';
    end if;
  elsif p_expected_relations_revision is not null then
    raise exception using
      errcode = '23514',
      message = 'new entities cannot supply an existing relation revision';
  end if;

  if pg_catalog.cardinality(selected_tag_ids) is distinct from (
    select pg_catalog.count(distinct selected.tag_id)::integer
    from pg_catalog.unnest(selected_tag_ids) as selected(tag_id)
  ) then
    raise exception using
      errcode = '23514',
      message = 'entity tags must be unique';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(selected_tag_ids) as selected(tag_id)
    left join public.tags as tag on tag.id = selected.tag_id
    where tag.id is null or tag.publication_status = 'archived'
  ) then
    raise exception using
      errcode = '23503',
      message = 'a selected tag is unavailable';
  end if;

  if p_publication_status = 'published' and exists (
    select 1
    from pg_catalog.unnest(selected_tag_ids) as selected(tag_id)
    join public.tags as tag on tag.id = selected.tag_id
    where tag.publication_status <> 'published'
  ) then
    raise exception using
      errcode = '23514',
      message = 'published entities require published tags';
  end if;

  if not exists (
    select 1
    from public.categories as category
    where category.id = p_category_id
      and category.publication_status <> 'archived'
  ) then
    raise exception using
      errcode = '23503',
      message = 'the selected category is unavailable';
  end if;

  if p_publication_status = 'published' and not exists (
    select 1
    from public.categories as category
    where category.id = p_category_id
      and category.publication_status = 'published'
  ) then
    raise exception using
      errcode = '23514',
      message = 'a published entity requires a published category';
  end if;

  if pg_catalog.jsonb_typeof(p_dispositions) is distinct from 'array' then
    raise exception using
      errcode = '23514',
      message = 'dispositions must be an array';
  end if;

  if p_expected_updated_at is null then
    insert into public.map_entities (
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
      p_id,
      p_slug,
      p_entity_type,
      p_visibility,
      p_name,
      'en',
      p_summary,
      p_description,
      p_x,
      p_y,
      p_category_id,
      p_publication_status
    );
  else
    update public.map_entities as entity
    set slug = p_slug,
        visibility = p_visibility,
        name = p_name,
        name_language = 'en',
        summary = p_summary,
        description = p_description,
        x = p_x,
        y = p_y,
        category_id = p_category_id,
        publication_status = p_publication_status
    where entity.id = p_id
      and entity.updated_at = p_expected_updated_at;

    if not found then
      raise exception using
        errcode = '40001',
        message = 'the entity changed while it was being saved';
    end if;
  end if;

  perform 1
  from public.entity_player_dispositions as relation
  where relation.entity_id = p_id
  for update;

  select pg_catalog.count(*)::integer
  into disposition_count
  from pg_catalog.jsonb_to_recordset(p_dispositions) as input(player_id text, disposition text);

  if disposition_count is distinct from (
    select pg_catalog.count(*)::integer
    from public.entity_player_dispositions as relation
    where relation.entity_id = p_id
  ) or disposition_count is distinct from (
    select pg_catalog.count(distinct input.player_id)::integer
    from pg_catalog.jsonb_to_recordset(p_dispositions) as input(player_id text, disposition text)
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_dispositions) as input(player_id text, disposition text)
    where input.player_id is null
      or input.disposition not in ('ally', 'enemy', 'neutral')
  ) or exists (
    select relation.player_id
    from public.entity_player_dispositions as relation
    where relation.entity_id = p_id
    except
    select input.player_id
    from pg_catalog.jsonb_to_recordset(p_dispositions) as input(player_id text, disposition text)
  ) then
    raise exception using
      errcode = '23514',
      message = 'dispositions no longer match the player matrix';
  end if;

  delete from public.entity_tags as link
  where link.entity_id = p_id
    and not (link.tag_id = any(selected_tag_ids))
    and link.published_at is null;

  update public.entity_tags as link
  set publication_status = 'archived'
  where link.entity_id = p_id
    and not (link.tag_id = any(selected_tag_ids))
    and link.published_at is not null
    and link.publication_status <> 'archived';

  update public.entity_tags as link
  set publication_status = 'draft'
  where link.entity_id = p_id
    and link.tag_id = any(selected_tag_ids)
    and link.publication_status = 'archived';

  insert into public.entity_tags (id, entity_id, tag_id, publication_status)
  select
    'entity-tag-' || pg_catalog.substr(pg_catalog.md5(p_id || ':' || selected.tag_id), 1, 24),
    p_id,
    selected.tag_id,
    case when p_publication_status = 'published'
      then 'published'::public.publication_status
      else 'draft'::public.publication_status
    end
  from pg_catalog.unnest(selected_tag_ids) as selected(tag_id)
  where not exists (
    select 1
    from public.entity_tags as existing_link
    where existing_link.entity_id = p_id
      and existing_link.tag_id = selected.tag_id
  );

  if p_publication_status = 'published' then
    update public.entity_tags as link
    set publication_status = 'published'
    where link.entity_id = p_id
      and link.tag_id = any(selected_tag_ids)
      and link.publication_status <> 'published';
  end if;

  update public.entity_player_dispositions as relation
  set disposition = input.disposition::public.player_disposition
  from pg_catalog.jsonb_to_recordset(p_dispositions) as input(player_id text, disposition text)
  where relation.entity_id = p_id
    and relation.player_id = input.player_id
    and relation.disposition is distinct from input.disposition::public.player_disposition;

  return public.admin_get_map_entity_editor(p_id);
end;
$$;

revoke all on function public.admin_get_map_entity_editor(text) from public, anon;
grant execute on function public.admin_get_map_entity_editor(text) to authenticated;

revoke all on function public.admin_save_map_entity(
  text,
  timestamptz,
  text,
  text,
  public.entity_type,
  public.map_visibility,
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
grant execute on function public.admin_save_map_entity(
  text,
  timestamptz,
  text,
  text,
  public.entity_type,
  public.map_visibility,
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

comment on function public.admin_get_map_entity_editor(text) is
  'Returns an RLS-protected administrative snapshot for MAP-019, including relation revision and safe-delete blockers.';
comment on function public.admin_save_map_entity(
  text,
  timestamptz,
  text,
  text,
  public.entity_type,
  public.map_visibility,
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
  'Atomically saves a MAP-019 entity, selected tags and player dispositions with optimistic concurrency under RLS.';
