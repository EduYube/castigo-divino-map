-- MAP-075: additive global cartography and campaign-scoped placements.
-- No legacy entity, snapshot, geography, or campaign is rewritten.
begin;

alter table public.map_entities
  add column world_map_enabled boolean not null default true;

alter table public.map_entities
  drop constraint map_entities_spatial_contract_check;

alter table public.map_entities
  add constraint map_entities_spatial_contract_check check (
    (
      entity_type = 'organization'::public.entity_type
      and world_map_enabled and x is null and y is null and geometry is null
      and visibility = 'search_only'::public.map_visibility
      and lifecycle_status is null and portrait_path is null
    )
    or (
      entity_type <> 'organization'::public.entity_type
      and (
        (world_map_enabled and x is not null and y is not null and geometry is not null)
        or (not world_map_enabled and x is null and y is null and geometry is null)
      )
    )
  );

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

  -- MAP-075 opt-in local-only entity; do not reinterpret world coordinates.
  if not new.world_map_enabled then
    if new.x is not null or new.y is not null or new.geometry is not null then
      raise exception using errcode = '23514',
        message = 'local-only entities must not carry legacy world geometry';
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

-- Worldless entities are intentionally not exported by the v1.2 world-only
-- reader. MAP-079 will switch public fetching to an explicit map selection.
drop policy if exists map_entities_public_select on public.map_entities;
create policy map_entities_public_select on public.map_entities
for select to anon, authenticated
using (
  world_map_enabled
  and publication_status = 'published'::public.publication_status
  and audience = 'public'::public.entity_audience
  and exists (
    select 1 from public.campaigns campaign
    where campaign.id = map_entities.campaign_id and campaign.status = 'active'
  )
  and exists (
    select 1 from public.categories category
    where category.id = map_entities.category_id
      and category.campaign_id = map_entities.campaign_id
      and category.publication_status = 'published'::public.publication_status
  )
);

create table public.map_contexts (
  id text primary key,
  slug text not null unique,
  name text not null,
  parent_id text references public.map_contexts(id) on update restrict on delete restrict,
  width double precision not null,
  height double precision not null,
  publication_status public.publication_status not null default 'draft',
  published_at timestamptz,
  archived_at timestamptz,
  -- Metadata of the source is deliberately independent of campaign contents.
  image_uri text,
  loading_strategy text,
  source_url text,
  rights_holder text,
  attribution text,
  license_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint map_contexts_id_check check (id ~ '^map-[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint map_contexts_slug_check check (slug ~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  constraint map_contexts_name_check check (pg_catalog.length(pg_catalog.btrim(name)) between 1 and 160),
  constraint map_contexts_dimensions_check check (
    width > 0 and height > 0
    and width not in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    and height not in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
  ),
  constraint map_contexts_parent_not_self_check check (parent_id is distinct from id),
  constraint map_contexts_loading_strategy_check check (
    loading_strategy is null or loading_strategy in ('remote', 'bundled')
  ),
  constraint map_contexts_image_provenance_check check (
    (image_uri is null and loading_strategy is null)
    or (image_uri is not null and loading_strategy is not null
      and nullif(pg_catalog.btrim(coalesce(source_url,'')), '') is not null
      and nullif(pg_catalog.btrim(coalesce(rights_holder,'')), '') is not null
      and nullif(pg_catalog.btrim(coalesce(license_notes,'')), '') is not null)
  )
);

create index map_contexts_parent_idx on public.map_contexts(parent_id)
  where parent_id is not null;

-- Canonical geometry remains on each surface, not on the entity.
create table public.entity_map_placements (
  campaign_id uuid not null,
  map_context_id text not null,
  entity_id text not null,
  geometry jsonb not null,
  x double precision not null,
  y double precision not null,
  publication_status public.publication_status not null default 'draft',
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, map_context_id, entity_id),
  constraint entity_map_placements_campaign_fk
    foreign key (campaign_id) references public.campaigns(id) on update restrict on delete restrict,
  constraint entity_map_placements_context_fk
    foreign key (map_context_id) references public.map_contexts(id) on update restrict on delete restrict,
  constraint entity_map_placements_entity_campaign_fk
    foreign key (entity_id, campaign_id)
    references public.map_entities(id, campaign_id) on update restrict on delete restrict,
  constraint entity_map_placements_geometry_kind_check check (geometry ->> 'kind' in ('point','polygon'))
);

create index entity_map_placements_context_idx
  on public.entity_map_placements(map_context_id, campaign_id);
create index entity_map_placements_entity_idx
  on public.entity_map_placements(campaign_id, entity_id);

-- Extend MAP-060's strict deterministic normalizer without weakening the
-- original 3600 x 2329 world normalizer (which remains entirely unchanged).
create function private.normalize_map_context_geometry(
  p_entity_type public.entity_type,
  p_geometry jsonb,
  p_width double precision,
  p_height double precision
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  kind text;
  vertices jsonb;
  vertex_count integer;
  xs double precision[] := '{}'::double precision[];
  ys double precision[] := '{}'::double precision[];
  reversed_xs double precision[] := '{}'::double precision[];
  reversed_ys double precision[] := '{}'::double precision[];
  canonical_vertices jsonb := '[]'::jsonb;
  x_value double precision;
  y_value double precision;
  area_twice double precision := 0;
  first_index integer := 1;
  next_index integer;
  output_index integer;
  epsilon constant double precision := 1e-9;
begin
  if pg_catalog.jsonb_typeof(p_geometry) is distinct from 'object' then
    raise exception using errcode = '23514', message = 'map geometry must be an object';
  end if;

  kind := p_geometry ->> 'kind';

  if kind = 'point' then
    if pg_catalog.jsonb_typeof(p_geometry -> 'coordinates') is distinct from 'object' then
      raise exception using errcode = '23514', message = 'point geometry requires coordinates';
    end if;

    begin
      x_value := (p_geometry #>> '{coordinates,x}')::double precision;
      y_value := (p_geometry #>> '{coordinates,y}')::double precision;
    exception when others then
      raise exception using errcode = '23514', message = 'point geometry coordinates must be numeric';
    end;

    if x_value not between 0 and p_width
       or y_value not between 0 and p_height
       or x_value in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
       or y_value in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision) then
      raise exception using errcode = '23514', message = 'point geometry is outside map bounds';
    end if;

    return pg_catalog.jsonb_build_object(
      'kind', 'point',
      'coordinates', pg_catalog.jsonb_build_object('x', x_value, 'y', y_value)
    );
  end if;

  if kind is distinct from 'polygon' then
    raise exception using errcode = '23514', message = 'map geometry kind must be point or polygon';
  end if;

  if p_entity_type is distinct from 'location'::public.entity_type then
    raise exception using errcode = '23514', message = 'only locations may use polygon geometry';
  end if;

  vertices := p_geometry -> 'vertices';
  if pg_catalog.jsonb_typeof(vertices) is distinct from 'array' then
    raise exception using errcode = '23514', message = 'polygon geometry requires vertices';
  end if;

  vertex_count := pg_catalog.jsonb_array_length(vertices);
  if vertex_count < 3 then
    raise exception using errcode = '23514', message = 'polygon geometry requires at least three vertices';
  end if;
  if vertex_count > 64 then
    raise exception using errcode = '23514', message = 'polygon geometry exceeds the 64 vertex limit';
  end if;

  for i in 0..vertex_count - 1 loop
    if pg_catalog.jsonb_typeof(vertices -> i) is distinct from 'object' then
      raise exception using errcode = '23514', message = 'polygon vertices must be coordinate objects';
    end if;
    begin
      x_value := ((vertices -> i) ->> 'x')::double precision;
      y_value := ((vertices -> i) ->> 'y')::double precision;
    exception when others then
      raise exception using errcode = '23514', message = 'polygon vertex coordinates must be numeric';
    end;

    if x_value not between 0 and p_width
       or y_value not between 0 and p_height
       or x_value in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
       or y_value in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision) then
      raise exception using errcode = '23514', message = 'polygon geometry is outside map bounds';
    end if;

    xs := pg_catalog.array_append(xs, x_value);
    ys := pg_catalog.array_append(ys, y_value);
  end loop;

  -- Repeated vertices make canonical rotation ambiguous and introduce degenerate
  -- edges. Polygons use implicit closure: the first vertex must not be repeated.
  for i in 1..vertex_count loop
    for j in i + 1..vertex_count loop
      if xs[i] = xs[j] and ys[i] = ys[j] then
        raise exception using errcode = '23514', message = 'polygon geometry cannot repeat vertices';
      end if;
    end loop;
  end loop;

  for i in 1..vertex_count loop
    next_index := case when i = vertex_count then 1 else i + 1 end;
    area_twice := area_twice + xs[i] * ys[next_index] - xs[next_index] * ys[i];
  end loop;

  if pg_catalog.abs(area_twice) <= epsilon then
    raise exception using errcode = '23514', message = 'polygon geometry must have non-zero area';
  end if;

  -- Reject any intersection between non-adjacent edges, including touching or
  -- overlapping collinear segments. With the bounded 64-vertex contract the
  -- quadratic check is deterministic and cheap.
  for i in 1..vertex_count loop
    next_index := case when i = vertex_count then 1 else i + 1 end;
    for j in i + 1..vertex_count loop
      if j = i + 1 or (i = 1 and j = vertex_count) then
        continue;
      end if;
      if private.map_geometry_segments_intersect(
        xs[i], ys[i], xs[next_index], ys[next_index],
        xs[j], ys[j],
        xs[case when j = vertex_count then 1 else j + 1 end],
        ys[case when j = vertex_count then 1 else j + 1 end]
      ) then
        raise exception using errcode = '23514', message = 'polygon geometry cannot self-intersect';
      end if;
    end loop;
  end loop;

  -- Canonical orientation is counter-clockwise in stored x/y space.
  if area_twice < 0 then
    for i in reverse vertex_count..1 loop
      reversed_xs := pg_catalog.array_append(reversed_xs, xs[i]);
      reversed_ys := pg_catalog.array_append(reversed_ys, ys[i]);
    end loop;
    xs := reversed_xs;
    ys := reversed_ys;
  end if;

  -- Canonical rotation starts at the lexicographically smallest (x,y) vertex.
  for i in 2..vertex_count loop
    if xs[i] < xs[first_index] or (xs[i] = xs[first_index] and ys[i] < ys[first_index]) then
      first_index := i;
    end if;
  end loop;

  for i in 0..vertex_count - 1 loop
    output_index := ((first_index - 1 + i) % vertex_count) + 1;
    canonical_vertices := canonical_vertices || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('x', xs[output_index], 'y', ys[output_index])
    );
  end loop;

  return pg_catalog.jsonb_build_object('kind', 'polygon', 'vertices', canonical_vertices);
end;
$$;

create function private.enforce_map_context()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  invalid_cycle boolean;
  parent_status public.publication_status;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.slug is distinct from old.slug then
      raise exception using errcode = '23514', message = 'map context identity is immutable';
    end if;
    if (new.width,new.height) is distinct from (old.width,old.height)
       and exists (select 1 from public.entity_map_placements p where p.map_context_id = old.id) then
      raise exception using errcode = '23514',
        message = 'map dimensions cannot change while placements exist';
    end if;
  end if;
  -- A global lock serializes concurrent hierarchy mutations. This is limited
  -- to rare editorial operations, never to geometry placements.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('map-contexts-hierarchy', 0)
  );
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception using errcode = '23514', message = 'map context cannot parent itself';
    end if;
    select p.publication_status into parent_status
    from public.map_contexts p where p.id = new.parent_id for share;
    if not found then
      raise exception using errcode = '23503', message = 'parent map context does not exist';
    end if;
    with recursive ancestors(id,parent_id) as (
      select a.id, a.parent_id from public.map_contexts a where a.id = new.parent_id
      union
      select a.id, a.parent_id from public.map_contexts a
      join ancestors prior on a.id = prior.parent_id
    )
    select exists(select 1 from ancestors where id = new.id) into invalid_cycle;
    if invalid_cycle then
      raise exception using errcode = '23514', message = 'map context hierarchy cycle';
    end if;
    if new.publication_status = 'published'::public.publication_status
       and parent_status <> 'published'::public.publication_status then
      raise exception using errcode = '23514',
        message = 'published context requires a published parent';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.publication_status <> 'published'::public.publication_status
     and old.publication_status = 'published'::public.publication_status
     and exists (
       select 1 from public.map_contexts child
       where child.parent_id = new.id
         and child.publication_status = 'published'::public.publication_status
     ) then
    raise exception using errcode = '23514',
      message = 'published descendants require a published parent';
  end if;
  return new;
end;
$$;

create trigger "20_map_context_guard"
before insert or update on public.map_contexts
for each row execute function private.enforce_map_context();
create trigger "40_map_context_lifecycle"
before insert or update on public.map_contexts
for each row execute function private.enforce_publication_lifecycle();
create trigger "90_map_context_updated_at"
before update on public.map_contexts
for each row execute function private.set_updated_at();

create function private.enforce_entity_map_placement()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  entity_type_value public.entity_type;
  map_width double precision;
  map_height double precision;
  normalized jsonb;
  representative record;
begin
  if tg_op = 'UPDATE' and new.campaign_id is distinct from old.campaign_id then
    raise exception using errcode = '23514', message = 'placement campaign is immutable';
  end if;
  if tg_op = 'UPDATE' and new.geometry is not distinct from old.geometry
     and (new.x is distinct from old.x or new.y is distinct from old.y) then
    raise exception using errcode = '23514',
      message = 'placement representative coordinates are derived';
  end if;
  -- Locks close the race against dimension updates and entity state/type
  -- transitions. Composite FK is the final authority for campaign identity.
  select c.width, c.height into map_width, map_height
  from public.map_contexts c where c.id = new.map_context_id for share;
  if not found then
    raise exception using errcode = '23503', message = 'map context does not exist';
  end if;
  select e.entity_type into entity_type_value
  from public.map_entities e
  where e.id = new.entity_id and e.campaign_id = new.campaign_id for share;
  if not found then
    raise exception using errcode = '23503', message = 'entity not found in placement campaign';
  end if;
  if entity_type_value = 'organization'::public.entity_type then
    raise exception using errcode = '23514', message = 'organization cannot have a placement';
  end if;
  normalized := private.normalize_map_context_geometry(
    entity_type_value, new.geometry, map_width, map_height
  );
  select rep.x, rep.y into representative
  from private.map_entity_geometry_representative(normalized) rep;
  new.geometry := normalized;
  new.x := representative.x;
  new.y := representative.y;
  return new;
end;
$$;

create trigger "20_entity_map_placement_guard"
before insert or update on public.entity_map_placements
for each row execute function private.enforce_entity_map_placement();
create trigger "40_entity_map_placement_lifecycle"
before insert or update on public.entity_map_placements
for each row execute function private.enforce_publication_lifecycle();
create trigger "90_entity_map_placement_updated_at"
before update on public.entity_map_placements
for each row execute function private.set_updated_at();

alter table public.map_contexts enable row level security;
alter table public.entity_map_placements enable row level security;

create policy map_contexts_published_select on public.map_contexts
for select to anon, authenticated
using (publication_status = 'published'::public.publication_status);
create policy map_contexts_admin_all on public.map_contexts
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy placements_public_select on public.entity_map_placements
for select to anon, authenticated
using (
  publication_status = 'published'::public.publication_status
  and exists (
    select 1 from public.map_contexts context
    where context.id = entity_map_placements.map_context_id
      and context.publication_status = 'published'::public.publication_status
  )
  and exists (
    select 1 from public.map_entities entity
    join public.categories category
      on category.id = entity.category_id
     and category.campaign_id = entity.campaign_id
    join public.campaigns campaign
      on campaign.id = entity.campaign_id
    where entity.id = entity_map_placements.entity_id
      and entity.campaign_id = entity_map_placements.campaign_id
      and entity.world_map_enabled
      and entity.publication_status = 'published'::public.publication_status
      and entity.audience = 'public'::public.entity_audience
      and category.publication_status = 'published'::public.publication_status
      and campaign.status = 'active'
  )
);
create policy placements_admin_all on public.entity_map_placements
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

revoke all on public.map_contexts, public.entity_map_placements from public, anon, authenticated;
grant select on public.map_contexts to anon, authenticated;
grant select on public.entity_map_placements to anon, authenticated;
grant insert, update, delete on public.map_contexts to authenticated;
grant insert, update, delete on public.entity_map_placements to authenticated;

revoke all on function private.normalize_map_context_geometry(
  public.entity_type,jsonb,double precision,double precision
) from public, anon, authenticated;
grant execute on function private.normalize_map_context_geometry(
  public.entity_type,jsonb,double precision,double precision
) to authenticated;
revoke all on function private.enforce_map_context() from public, anon, authenticated;
revoke all on function private.enforce_entity_map_placement() from public, anon, authenticated;

comment on column public.map_entities.world_map_enabled is
 'True for legacy world x/y/geometry; false for new local-only spatial entities with a null world geometry.';
comment on table public.map_contexts is
 'Campaign-independent physical image-space map surfaces. No maps required for locations.';
comment on table public.entity_map_placements is
 'Canonical campaign-specific entity geometry per reusable physical map surface.';

commit;
