-- MAP-069: organizations are first-class catalog entities but are explicitly non-spatial.
-- The enum expansion commits separately because PostgreSQL cannot safely reference a newly-added
-- enum value from constraints/functions in the same transaction.

begin;
alter type public.entity_type add value if not exists 'organization' after 'hazard';
commit;

begin;

-- Spatial coordinates remain mandatory for every pre-MAP-069 entity class, while organizations
-- are represented by the explicit absence of spatial data. No sentinel coordinates are permitted.
alter table public.map_entities
  alter column x drop not null,
  alter column y drop not null,
  alter column geometry drop not null;

alter table public.map_entities
  drop constraint if exists map_entities_character_point_geometry_check,
  drop constraint if exists map_entities_functional_lifecycle_check;

alter table public.map_entities
  add constraint map_entities_spatial_contract_check
  check (
    (
      entity_type = 'organization'::public.entity_type
      and x is null
      and y is null
      and geometry is null
      and visibility = 'search_only'::public.map_visibility
      and lifecycle_status is null
      and portrait_path is null
    )
    or
    (
      entity_type <> 'organization'::public.entity_type
      and x is not null
      and y is not null
      and geometry is not null
    )
  ),
  add constraint map_entities_spatial_point_geometry_check
  check (
    entity_type = 'organization'::public.entity_type
    or entity_type = 'location'::public.entity_type
    or geometry ->> 'kind' = 'point'
  ),
  add constraint map_entities_functional_lifecycle_check
  check (
    (entity_type in (
      'character'::public.entity_type,
      'location'::public.entity_type,
      'organization'::public.entity_type
    ) and lifecycle_status is null)
    or (entity_type = 'mission'::public.entity_type
      and lifecycle_status in (
        'active'::public.entity_lifecycle_status,
        'completed'::public.entity_lifecycle_status,
        'failed'::public.entity_lifecycle_status
      ))
    or (entity_type = 'hazard'::public.entity_type
      and lifecycle_status in (
        'active'::public.entity_lifecycle_status,
        'resolved'::public.entity_lifecycle_status
      ))
  );

-- Keep the mature MAP-060 geometry normalizer unchanged for spatial entities. The trigger is the
-- schema boundary that recognizes the new non-spatial capability and never calls the normalizer
-- for an organization.
create or replace function private.enforce_map_entity_geometry()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized jsonb;
  representative record;
begin
  if new.entity_type = 'organization'::public.entity_type then
    if new.x is not null or new.y is not null or new.geometry is not null then
      raise exception using
        errcode = '23514',
        message = 'organization must not carry map coordinates or geometry';
    end if;
    if new.visibility is distinct from 'search_only'::public.map_visibility then
      raise exception using
        errcode = '23514',
        message = 'organization visibility must be search_only';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    normalized := private.normalize_map_entity_geometry(
      new.entity_type,
      coalesce(
        new.geometry,
        pg_catalog.jsonb_build_object(
          'kind', 'point',
          'coordinates', pg_catalog.jsonb_build_object('x', new.x, 'y', new.y)
        )
      )
    );
  elsif new.entity_type is distinct from old.entity_type
        or new.geometry is distinct from old.geometry then
    normalized := private.normalize_map_entity_geometry(new.entity_type, new.geometry);
  elsif new.x is distinct from old.x or new.y is distinct from old.y then
    if old.geometry ->> 'kind' <> 'point' then
      raise exception using
        errcode = '23514',
        message = 'polygon representative coordinates are derived from geometry';
    end if;
    normalized := private.normalize_map_entity_geometry(
      new.entity_type,
      pg_catalog.jsonb_build_object(
        'kind', 'point',
        'coordinates', pg_catalog.jsonb_build_object('x', new.x, 'y', new.y)
      )
    );
  else
    return new;
  end if;

  select rep.x, rep.y
  into representative
  from private.map_entity_geometry_representative(normalized) as rep;

  new.geometry := normalized;
  new.x := representative.x;
  new.y := representative.y;
  return new;
end;
$$;

revoke all on function private.enforce_map_entity_geometry() from public, anon, authenticated;

-- Generic entity relations are campaign-bound and stored once in canonical endpoint order.
create table public.entity_relations (
  campaign_id uuid not null,
  left_entity_id text not null,
  right_entity_id text not null,
  left_label text not null,
  right_label text not null,
  created_at timestamptz not null default now(),
  primary key (campaign_id, left_entity_id, right_entity_id),
  constraint entity_relations_campaign_fk
    foreign key (campaign_id) references public.campaigns(id) on delete restrict,
  constraint entity_relations_left_campaign_fk
    foreign key (left_entity_id, campaign_id)
    references public.map_entities(id, campaign_id) on delete restrict,
  constraint entity_relations_right_campaign_fk
    foreign key (right_entity_id, campaign_id)
    references public.map_entities(id, campaign_id) on delete restrict,
  constraint entity_relations_canonical_pair_check
    check (left_entity_id < right_entity_id),
  constraint entity_relations_left_label_check
    check (pg_catalog.length(pg_catalog.btrim(left_label)) between 1 and 80),
  constraint entity_relations_right_label_check
    check (pg_catalog.length(pg_catalog.btrim(right_label)) between 1 and 80)
);

create index entity_relations_campaign_left_idx
  on public.entity_relations(campaign_id, left_entity_id);
create index entity_relations_campaign_right_idx
  on public.entity_relations(campaign_id, right_entity_id);

alter table public.entity_relations enable row level security;

create policy entity_relations_public_select
on public.entity_relations
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.map_entities as left_entity
    join public.map_entities as right_entity
      on right_entity.id = entity_relations.right_entity_id
     and right_entity.campaign_id = entity_relations.campaign_id
    join public.campaigns as campaign
      on campaign.id = entity_relations.campaign_id
    where left_entity.id = entity_relations.left_entity_id
      and left_entity.campaign_id = entity_relations.campaign_id
      and left_entity.publication_status = 'published'::public.publication_status
      and right_entity.publication_status = 'published'::public.publication_status
      and left_entity.audience = 'public'::public.entity_audience
      and right_entity.audience = 'public'::public.entity_audience
      and campaign.status = 'active'
  )
);

create policy entity_relations_admin_all
on public.entity_relations
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

revoke all on public.entity_relations from public, anon, authenticated;
grant select (campaign_id, left_entity_id, right_entity_id, left_label, right_label)
  on public.entity_relations to anon;
grant select (campaign_id, left_entity_id, right_entity_id, left_label, right_label, created_at),
  insert (campaign_id, left_entity_id, right_entity_id, left_label, right_label),
  delete
  on public.entity_relations to authenticated;

-- Exclude organizations from both automatic player-disposition insertion paths.
create or replace function private.ensure_entity_player_dispositions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('entity-player-disposition-matrix'));

  if tg_table_name = 'map_entities' then
    if new.entity_type <> 'organization'::public.entity_type then
      insert into public.entity_player_dispositions(entity_id, player_id, campaign_id)
      select new.id, player.id, new.campaign_id
      from public.players as player
      where player.campaign_id = new.campaign_id
        and player.character_entity_id is distinct from new.id
      on conflict (entity_id, player_id) do nothing;
    end if;
  elsif tg_table_name = 'players' then
    insert into public.entity_player_dispositions(entity_id, player_id, campaign_id)
    select entity.id, new.id, new.campaign_id
    from public.map_entities as entity
    where entity.campaign_id = new.campaign_id
      and entity.entity_type <> 'organization'::public.entity_type
      and new.character_entity_id is distinct from entity.id
    on conflict (entity_id, player_id) do nothing;
  else
    raise exception using errcode = '0A000', message = 'unsupported disposition matrix trigger source';
  end if;
  return new;
end;
$$;

-- Organizations never participate in the player-disposition subsystem.
create function private.reject_organization_player_disposition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.map_entities entity
    where entity.id = new.entity_id
      and entity.campaign_id = new.campaign_id
      and entity.entity_type = 'organization'::public.entity_type
  ) then
    raise exception using errcode = '23514', message = 'organization cannot carry player dispositions';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_organization_player_disposition()
  from public, anon, authenticated;

create trigger entity_player_dispositions_reject_organization
before insert or update of entity_id, campaign_id on public.entity_player_dispositions
for each row execute function private.reject_organization_player_disposition();

create function private.entity_relations_revision(p_campaign_id uuid, p_entity_id text)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.md5(
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'left', relation.left_entity_id,
          'right', relation.right_entity_id,
          'leftLabel', relation.left_label,
          'rightLabel', relation.right_label
        )
        order by relation.left_entity_id, relation.right_entity_id
      ),
      '[]'::jsonb
    )::text
  )
  from public.entity_relations relation
  where relation.campaign_id = p_campaign_id
    and (relation.left_entity_id = p_entity_id or relation.right_entity_id = p_entity_id);
$$;

revoke all on function private.entity_relations_revision(uuid, text) from public, anon;
grant execute on function private.entity_relations_revision(uuid, text) to authenticated;

create function public.admin_get_map_entity_editor_v8(
  p_campaign_id uuid,
  p_entity_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  editor jsonb;
  relations jsonb;
  relation_entities jsonb;
  relation_count integer;
begin
  if not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'administrative authorization required';
  end if;

  -- V6 uses jsonb_set with SQL NULL geometry, which nullifies the entire
  -- editor for non-spatial organizations. Start from the V5 catalog editor
  -- and explicitly represent geometry/lifecycle as JSON null instead.
  if exists (
    select 1 from public.map_entities entity
    where entity.id = p_entity_id and entity.campaign_id = p_campaign_id
      and entity.entity_type = 'organization'::public.entity_type
  ) then
    editor := public.admin_get_map_entity_editor_v5(p_campaign_id, p_entity_id);
    if editor is not null then
      editor := pg_catalog.jsonb_set(editor, '{record,geometry}', 'null'::jsonb, true);
      editor := pg_catalog.jsonb_set(editor, '{record,lifecycleStatus}', 'null'::jsonb, true);
    end if;
  else
    editor := public.admin_get_map_entity_editor_v7(p_campaign_id, p_entity_id);
  end if;
  if editor is null then
    return null;
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'other_entity_id',
          case when relation.left_entity_id = p_entity_id
            then relation.right_entity_id else relation.left_entity_id end,
        'other_name', other_entity.name,
        'other_entity_type', other_entity.entity_type,
        'other_audience', other_entity.audience,
        'own_label',
          case when relation.left_entity_id = p_entity_id
            then relation.left_label else relation.right_label end,
        'other_label',
          case when relation.left_entity_id = p_entity_id
            then relation.right_label else relation.left_label end
      )
      order by other_entity.name, other_entity.id
    ),
    '[]'::jsonb
  ), pg_catalog.count(*)::integer
  into relations, relation_count
  from public.entity_relations relation
  join public.map_entities other_entity
    on other_entity.campaign_id = relation.campaign_id
   and other_entity.id = case when relation.left_entity_id = p_entity_id
     then relation.right_entity_id else relation.left_entity_id end
  where relation.campaign_id = p_campaign_id
    and (relation.left_entity_id = p_entity_id or relation.right_entity_id = p_entity_id);

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', entity.id,
        'name', entity.name,
        'entity_type', entity.entity_type,
        'audience', entity.audience,
        'publication_status', entity.publication_status
      )
      order by entity.name, entity.id
    ),
    '[]'::jsonb
  )
  into relation_entities
  from public.map_entities entity
  where entity.campaign_id = p_campaign_id
    and entity.id <> p_entity_id
    and entity.publication_status <> 'archived'::public.publication_status;

  editor := pg_catalog.jsonb_set(editor, '{entity_relations}', relations, true);
  editor := pg_catalog.jsonb_set(editor, '{relation_entities}', relation_entities, true);
  editor := pg_catalog.jsonb_set(
    editor,
    '{entity_relations_revision}',
    pg_catalog.to_jsonb(private.entity_relations_revision(p_campaign_id, p_entity_id)),
    true
  );
  editor := pg_catalog.jsonb_set(
    editor,
    '{delete_blockers,entity_relations}',
    pg_catalog.to_jsonb(relation_count),
    true
  );
  return editor;
end;
$$;

revoke all on function public.admin_get_map_entity_editor_v8(uuid, text) from public, anon;
grant execute on function public.admin_get_map_entity_editor_v8(uuid, text) to authenticated;

create function public.admin_save_map_entity_v8(
  p_campaign_id uuid,
  p_id text,
  p_expected_updated_at timestamptz,
  p_expected_relations_revision text,
  p_expected_entity_relations_revision text,
  p_slug text,
  p_entity_type public.entity_type,
  p_visibility public.map_visibility,
  p_audience public.entity_audience,
  p_portrait_path text,
  p_name text,
  p_summary text,
  p_description text,
  p_geometry jsonb,
  p_category_id text,
  p_publication_status public.publication_status,
  p_tag_ids text[],
  p_dispositions jsonb,
  p_player_association_ids text[],
  p_lifecycle_status public.entity_lifecycle_status,
  p_entity_relations jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.map_entities%rowtype;
  selected_tag_ids text[] := coalesce(p_tag_ids, '{}'::text[]);
  current_editor jsonb;
  current_relation_revision text;
  input_relation record;
  left_id text;
  right_id text;
  left_relation_label text;
  right_relation_label text;
begin
  if not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'administrative authorization required';
  end if;
  if not exists (select 1 from public.campaigns campaign where campaign.id = p_campaign_id) then
    raise exception using errcode = '23514', message = 'selected campaign does not exist';
  end if;
  if pg_catalog.jsonb_typeof(p_entity_relations) is distinct from 'array' then
    raise exception using errcode = '23514', message = 'entity relations must be an array';
  end if;
  if pg_catalog.cardinality(selected_tag_ids) is distinct from (
    select pg_catalog.count(distinct selected.tag_id)::integer
    from pg_catalog.unnest(selected_tag_ids) selected(tag_id)
  ) then
    raise exception using errcode = '23514', message = 'entity tags must be unique';
  end if;
  if exists (
    select 1
    from pg_catalog.unnest(selected_tag_ids) selected(tag_id)
    left join public.tags tag
      on tag.id = selected.tag_id and tag.campaign_id = p_campaign_id
    where tag.id is null or tag.publication_status = 'archived'::public.publication_status
  ) then
    raise exception using errcode = '23503', message = 'a selected tag is unavailable in the selected campaign';
  end if;
  if not exists (
    select 1 from public.categories category
    where category.id = p_category_id
      and category.campaign_id = p_campaign_id
      and category.publication_status <> 'archived'::public.publication_status
  ) then
    raise exception using errcode = '23503', message = 'the selected category is unavailable in the selected campaign';
  end if;

  -- Relations are shared by both endpoints. Serialize all v8 relation writes
  -- within one campaign before taking an individual entity lock, so concurrent
  -- edits from A and B cannot validate the same stale revision independently.
  -- The campaign-scoped lock avoids blocking unrelated campaigns.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin-entity-relations:' || p_campaign_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin-map-entity:' || p_id, 0)
  );

  current_relation_revision := private.entity_relations_revision(p_campaign_id, p_id);
  if p_expected_updated_at is null then
    if p_expected_relations_revision is not null
       or p_expected_entity_relations_revision is not null then
      raise exception using errcode = '23514', message = 'new entity cannot carry existing relation revisions';
    end if;
  elsif p_expected_entity_relations_revision is null
        or current_relation_revision is distinct from p_expected_entity_relations_revision then
    raise exception using errcode = '40001', message = 'entity relations changed while the editor was open';
  end if;

  if p_entity_type <> 'organization'::public.entity_type then
    perform public.admin_save_map_entity_v7(
      p_campaign_id, p_id, p_expected_updated_at, p_expected_relations_revision,
      p_slug, p_entity_type, p_visibility, p_audience, p_portrait_path,
      p_name, p_summary, p_description, p_geometry, p_category_id,
      p_publication_status, selected_tag_ids, p_dispositions,
      p_player_association_ids, p_lifecycle_status
    );
  else
    if p_visibility is distinct from 'search_only'::public.map_visibility
       or p_geometry is not null
       or p_portrait_path is not null
       or p_lifecycle_status is not null then
      raise exception using errcode = '23514', message = 'organization is non-spatial and search-only';
    end if;
    if pg_catalog.jsonb_typeof(p_dispositions) is distinct from 'array'
       or pg_catalog.jsonb_array_length(p_dispositions) <> 0
       or pg_catalog.cardinality(coalesce(p_player_association_ids, '{}'::text[])) <> 0 then
      raise exception using errcode = '23514', message = 'organization does not use player relations';
    end if;

    if p_expected_updated_at is null then
      if exists (select 1 from public.map_entities entity where entity.id = p_id) then
        raise exception using errcode = '40001', message = 'entity identity already exists';
      end if;
      insert into public.map_entities (
        campaign_id, id, slug, entity_type, visibility, audience, name, name_language,
        summary, description, x, y, category_id, publication_status
      ) values (
        p_campaign_id, p_id, p_slug, p_entity_type, 'search_only'::public.map_visibility,
        p_audience, p_name, 'en', p_summary, p_description, null, null, p_category_id,
        p_publication_status
      );
    else
      select entity.* into existing
      from public.map_entities entity
      where entity.id = p_id and entity.campaign_id = p_campaign_id
      for update;
      if not found then
        raise exception using errcode = '42501', message = 'entity does not belong to selected campaign';
      end if;
      if existing.updated_at is distinct from p_expected_updated_at then
        raise exception using errcode = '40001', message = 'the entity changed while it was being edited';
      end if;
      if existing.entity_type is distinct from 'organization'::public.entity_type then
        raise exception using errcode = '23514', message = 'entity_type is immutable';
      end if;
      current_editor := public.admin_get_map_entity_editor_v8(p_campaign_id, p_id);
      if p_expected_relations_revision is null
         or current_editor ->> 'relations_revision' is distinct from p_expected_relations_revision then
        raise exception using errcode = '40001', message = 'entity relations changed while the editor was open';
      end if;
      update public.map_entities entity
      set slug = p_slug,
          visibility = 'search_only'::public.map_visibility,
          audience = p_audience,
          portrait_path = null,
          name = p_name,
          summary = p_summary,
          description = p_description,
          category_id = p_category_id,
          publication_status = p_publication_status
      where entity.id = p_id and entity.campaign_id = p_campaign_id;
    end if;

    -- Organization tags use the same campaign-scoped relation table but never require geometry.
    delete from public.entity_tags link
    where link.entity_id = p_id
      and link.campaign_id = p_campaign_id
      and not (link.tag_id = any(selected_tag_ids));

    insert into public.entity_tags (
      campaign_id, id, entity_id, tag_id, publication_status
    )
    select
      p_campaign_id,
      'entity-tag-' || pg_catalog.substr(pg_catalog.md5(p_id || ':' || selected.tag_id), 1, 24),
      p_id,
      selected.tag_id,
      case when p_publication_status = 'published'::public.publication_status
        then 'published'::public.publication_status else 'draft'::public.publication_status end
    from pg_catalog.unnest(selected_tag_ids) selected(tag_id)
    on conflict (entity_id, tag_id) do update
      set publication_status = excluded.publication_status;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_entity_relations)
      as relation("targetEntityId" text, "ownLabel" text, "targetLabel" text)
    where relation."targetEntityId" is null
      or relation."targetEntityId" = p_id
      or pg_catalog.length(pg_catalog.btrim(coalesce(relation."ownLabel", ''))) not between 1 and 80
      or pg_catalog.length(pg_catalog.btrim(coalesce(relation."targetLabel", ''))) not between 1 and 80
      or not exists (
        select 1 from public.map_entities target
        where target.id = relation."targetEntityId"
          and target.campaign_id = p_campaign_id
          and (
            target.publication_status <> 'archived'::public.publication_status
            or exists (
              -- Previously recorded archived destinations may be retained,
              -- but creating a NEW link to an archived target is forbidden.
              select 1 from public.entity_relations previous
              where previous.campaign_id = p_campaign_id
                and (
                  (previous.left_entity_id = p_id and previous.right_entity_id = target.id)
                  or
                  (previous.right_entity_id = p_id and previous.left_entity_id = target.id)
                )
            )
          )
      )
  ) then
    raise exception using errcode = '23514', message = 'invalid generic entity relation';
  end if;

  if (
    select pg_catalog.count(*) <> pg_catalog.count(distinct relation."targetEntityId")
    from pg_catalog.jsonb_to_recordset(p_entity_relations)
      as relation("targetEntityId" text, "ownLabel" text, "targetLabel" text)
  ) then
    raise exception using errcode = '23514', message = 'generic entity relation targets must be unique';
  end if;

  delete from public.entity_relations relation
  where relation.campaign_id = p_campaign_id
    and (relation.left_entity_id = p_id or relation.right_entity_id = p_id);

  for input_relation in
    select relation."targetEntityId" as target_id,
           pg_catalog.btrim(relation."ownLabel") as own_label,
           pg_catalog.btrim(relation."targetLabel") as target_label
    from pg_catalog.jsonb_to_recordset(p_entity_relations)
      as relation("targetEntityId" text, "ownLabel" text, "targetLabel" text)
  loop
    if p_id < input_relation.target_id then
      left_id := p_id;
      right_id := input_relation.target_id;
      left_relation_label := input_relation.own_label;
      right_relation_label := input_relation.target_label;
    else
      left_id := input_relation.target_id;
      right_id := p_id;
      left_relation_label := input_relation.target_label;
      right_relation_label := input_relation.own_label;
    end if;
    insert into public.entity_relations (
      campaign_id, left_entity_id, right_entity_id, left_label, right_label
    ) values (
      p_campaign_id, left_id, right_id, left_relation_label, right_relation_label
    );
  end loop;

  return public.admin_get_map_entity_editor_v8(p_campaign_id, p_id);
end;
$$;

revoke all on function public.admin_save_map_entity_v8(
  uuid, text, timestamptz, text, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, jsonb, text, public.publication_status,
  text[], jsonb, text[], public.entity_lifecycle_status, jsonb
) from public, anon;
grant execute on function public.admin_save_map_entity_v8(
  uuid, text, timestamptz, text, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, jsonb, text, public.publication_status,
  text[], jsonb, text[], public.entity_lifecycle_status, jsonb
) to authenticated;

create function public.admin_get_master_catalog_v7(p_campaign_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
  relations jsonb;
begin
  result := public.admin_get_master_catalog_v6(p_campaign_id);

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'left_entity_id', relation.left_entity_id,
        'right_entity_id', relation.right_entity_id,
        'left_label', relation.left_label,
        'right_label', relation.right_label
      )
      order by relation.left_entity_id, relation.right_entity_id
    ),
    '[]'::jsonb
  )
  into relations
  from public.entity_relations relation
  join public.map_entities left_entity
    on left_entity.id = relation.left_entity_id
   and left_entity.campaign_id = relation.campaign_id
  join public.map_entities right_entity
    on right_entity.id = relation.right_entity_id
   and right_entity.campaign_id = relation.campaign_id
  where relation.campaign_id = p_campaign_id
    and left_entity.publication_status = 'published'::public.publication_status
    and right_entity.publication_status = 'published'::public.publication_status
    and (
      left_entity.audience = 'master'::public.entity_audience
      or right_entity.audience = 'master'::public.entity_audience
    );

  return result || pg_catalog.jsonb_build_object('entity_relations', relations);
end;
$$;

revoke all on function public.admin_get_master_catalog_v7(uuid) from public, anon;
grant execute on function public.admin_get_master_catalog_v7(uuid) to authenticated;

comment on table public.entity_relations is
  'MAP-069 one-row generic entity relation with canonical endpoints, campaign isolation and endpoint-relative labels.';
comment on constraint map_entities_spatial_contract_check on public.map_entities is
  'MAP-069 spatial capability contract: organizations have no x/y/geometry; every spatial entity retains complete spatial data.';
comment on function public.admin_save_map_entity_v8(
  uuid, text, timestamptz, text, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, jsonb, text, public.publication_status,
  text[], jsonb, text[], public.entity_lifecycle_status, jsonb
) is
  'MAP-069 campaign-scoped editor save supporting non-spatial organizations and generic entity relations.';
comment on function public.admin_get_master_catalog_v7(uuid) is
  'MAP-069 authorized campaign-scoped Master catalog including generic relations touching Master entities.';

commit;
