-- MAP-045: optional character portraits with entity-authoritative Storage ACL.
--
-- The binary lives in a private Storage bucket. PostgreSQL stores only an opaque,
-- stable object path on map_entities. Storage RLS derives read authorization from
-- the current entity row, so publication/audience changes revoke or grant binary
-- access without copying or renaming the object.

alter table public.map_entities
  add column portrait_path text;

alter table public.map_entities
  add constraint map_entities_portrait_character_only
  check (
    portrait_path is null
    or (
      entity_type = 'character'
      and portrait_path ~ '^portraits/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
    )
  );

comment on column public.map_entities.portrait_path is
  'MAP-045 opaque private Storage object path. Nullable and valid only for character entities.';

-- The v3 SECURITY INVOKER RPC updates this column under the caller's privileges.
-- Existing admin RLS remains the authoritative write boundary for authenticated roles.
grant update (portrait_path) on public.map_entities to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'character-portraits',
  'character-portraits',
  false,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Player-safe reads. The explicit entity/category checks intentionally mirror the
-- public map projection rather than trusting a client-provided audience. For an
-- authenticated non-admin, map_entities RLS still hides master rows; for anon the
-- same fail-closed public projection applies.
drop policy if exists character_portraits_public_select on storage.objects;
create policy character_portraits_public_select
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'character-portraits'
  and exists (
    select 1
    from public.map_entities as entity
    join public.categories as category on category.id = entity.category_id
    where entity.portrait_path = storage.objects.name
      and entity.entity_type = 'character'
      and entity.publication_status = 'published'
      and entity.audience = 'public'
      and category.publication_status = 'published'
  )
);

-- Admins may read draft/archived/master portraits while editing, but no authenticated
-- identity receives this path merely by being logged in.
drop policy if exists character_portraits_admin_select on storage.objects;
create policy character_portraits_admin_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'character-portraits'
  and private.is_admin()
);

-- Uploads always create a new UUID path. There is deliberately no UPDATE policy:
-- replacement is upload-new -> optimistic entity save -> delete-old, avoiding shared
-- object mutation and making stale-write compensation deterministic.
drop policy if exists character_portraits_admin_insert on storage.objects;
create policy character_portraits_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'character-portraits'
  and private.is_admin()
  and name ~ '^portraits/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and lower(coalesce(metadata ->> 'mimetype', '')) in ('image/jpeg', 'image/png', 'image/webp')
);

drop policy if exists character_portraits_admin_delete on storage.objects;
create policy character_portraits_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'character-portraits'
  and private.is_admin()
);

-- Versioned editor contract. v1/v2 remain backwards-compatible and cannot mutate the
-- portrait. v3 extends the same SECURITY INVOKER/RLS transaction used by MAP-019/044.
create function public.admin_get_map_entity_editor_v3(p_entity_id text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  base_result jsonb;
  entity_portrait_path text;
begin
  if not public.current_user_is_admin() then
    raise exception using
      errcode = '42501',
      message = 'administrative authorization required';
  end if;

  base_result := public.admin_get_map_entity_editor_v2(p_entity_id);
  if base_result is null then
    return null;
  end if;

  select entity.portrait_path
  into entity_portrait_path
  from public.map_entities as entity
  where entity.id = p_entity_id;

  return pg_catalog.jsonb_set(
    base_result,
    '{record}',
    (base_result -> 'record') || pg_catalog.jsonb_build_object('portrait_path', entity_portrait_path),
    false
  );
end;
$$;

create function public.admin_save_map_entity_v3(
  p_id text,
  p_expected_updated_at timestamptz,
  p_expected_relations_revision text,
  p_slug text,
  p_entity_type public.entity_type,
  p_visibility public.map_visibility,
  p_audience public.entity_audience,
  p_portrait_path text,
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

  perform public.admin_save_map_entity_v2(
    p_id,
    p_expected_updated_at,
    p_expected_relations_revision,
    p_slug,
    p_entity_type,
    p_visibility,
    p_audience,
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
  set portrait_path = p_portrait_path
  where entity.id = p_id
    and entity.portrait_path is distinct from p_portrait_path;

  if not found and not exists (
    select 1 from public.map_entities as entity where entity.id = p_id
  ) then
    raise exception using
      errcode = '40001',
      message = 'the entity changed while its portrait was being saved';
  end if;

  return public.admin_get_map_entity_editor_v3(p_id);
end;
$$;

revoke all on function public.admin_get_map_entity_editor_v3(text) from public, anon;
grant execute on function public.admin_get_map_entity_editor_v3(text) to authenticated;

revoke all on function public.admin_save_map_entity_v3(
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
  text,
  double precision,
  double precision,
  text,
  public.publication_status,
  text[],
  jsonb
) from public, anon;
grant execute on function public.admin_save_map_entity_v3(
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
  text,
  double precision,
  double precision,
  text,
  public.publication_status,
  text[],
  jsonb
) to authenticated;

comment on function public.admin_get_map_entity_editor_v3(text) is
  'MAP-045 admin-only entity editor snapshot including audience and nullable character portrait path.';
comment on function public.admin_save_map_entity_v3(
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
  text,
  double precision,
  double precision,
  text,
  public.publication_status,
  text[],
  jsonb
) is
  'MAP-045 atomic admin entity save including audience, portrait path and coordinates; SECURITY INVOKER/RLS protected.';

-- Master read contract v2 adds only the currently referenced portrait path. The
-- wrapper never broadens the v1 master catalog authorization and remains ephemeral.
create function public.admin_get_master_catalog_v2()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  base_result jsonb;
  enriched_entities jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception using
      errcode = '42501',
      message = 'administrative authorization required';
  end if;

  base_result := public.admin_get_master_catalog();

  select coalesce(
    pg_catalog.jsonb_agg(
      item.value || pg_catalog.jsonb_build_object('portrait_path', entity.portrait_path)
      order by item.value ->> 'id'
    ),
    '[]'::jsonb
  )
  into enriched_entities
  from pg_catalog.jsonb_array_elements(base_result -> 'entities') as item(value)
  join public.map_entities as entity on entity.id = item.value ->> 'id';

  return pg_catalog.jsonb_set(base_result, '{entities}', enriched_entities, false);
end;
$$;

revoke all on function public.admin_get_master_catalog_v2() from public, anon;
grant execute on function public.admin_get_master_catalog_v2() to authenticated;

comment on function public.admin_get_master_catalog_v2() is
  'MAP-045 authorized in-memory master catalog including nullable private portrait paths.';
