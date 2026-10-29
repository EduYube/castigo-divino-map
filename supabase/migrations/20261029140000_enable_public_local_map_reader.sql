-- MAP-079: public local-only access is authorized by a published placement
-- in a published map context *bound to the same active campaign*.
-- Forward-only ACL expansion; no productive rows or legacy geometry are changed.
begin;

-- The single privileged predicate avoids recursive RLS between map_entities and
-- entity_map_placements. It has no user-controlled dynamic SQL, an empty search_path,
-- and lives outside the Data API exposed schema.
create function private.map079_public_local_placement_exists(
  requested_campaign_id uuid,
  requested_context_id text,
  requested_entity_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.entity_map_placements placement
    join public.map_entities entity
      on entity.id = placement.entity_id
     and entity.campaign_id = placement.campaign_id
    join public.campaigns campaign
      on campaign.id = placement.campaign_id
    join public.categories category
      on category.id = entity.category_id
     and category.campaign_id = entity.campaign_id
    join public.map_contexts context
      on context.id = placement.map_context_id
    join public.campaign_geographic_map_context_links binding
      on binding.campaign_id = placement.campaign_id
     and binding.map_context_id = placement.map_context_id
    join public.geographic_names geography
      on geography.id = binding.geographic_name_id
    where placement.campaign_id = requested_campaign_id
      and placement.entity_id = requested_entity_id
      and (requested_context_id is null or placement.map_context_id = requested_context_id)
      and placement.publication_status = 'published'::public.publication_status
      and context.publication_status = 'published'::public.publication_status
      and entity.publication_status = 'published'::public.publication_status
      and entity.audience = 'public'::public.entity_audience
      and entity.entity_type <> 'organization'::public.entity_type
      and category.publication_status = 'published'::public.publication_status
      and campaign.status = 'active'
      and geography.publication_status = 'published'::public.publication_status
  );
$$;

-- INFRA #210: explicitly list the sole role allowed to execute this policy
-- predicate; no new table-wide grants or default privilege changes.
revoke all on function private.map079_public_local_placement_exists(uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function private.map079_public_local_placement_exists(uuid,text,text)
  to anon, authenticated;

drop policy if exists map_entities_public_select on public.map_entities;
create policy map_entities_public_select on public.map_entities
for select to anon, authenticated
using (
  publication_status = 'published'::public.publication_status
  and audience = 'public'::public.entity_audience
  and exists (
    select 1 from public.campaigns campaign
    where campaign.id = map_entities.campaign_id
      and campaign.status = 'active'
  )
  and exists (
    select 1 from public.categories category
    where category.id = map_entities.category_id
      and category.campaign_id = map_entities.campaign_id
      and category.publication_status = 'published'::public.publication_status
  )
  and (
    world_map_enabled
    or private.map079_public_local_placement_exists(
      campaign_id, null::text, id
    )
  )
);

drop policy if exists placements_public_select on public.entity_map_placements;
create policy placements_public_select on public.entity_map_placements
for select to anon, authenticated
using (
  private.map079_public_local_placement_exists(
    campaign_id, map_context_id, entity_id
  )
);

-- Existing SELECT and admin column-scoped write grants stay unchanged.
-- Explicitly assert the SELECT surface for the two already-exposed tables.
grant select on public.map_entities to anon, authenticated;
grant select on public.entity_map_placements to anon, authenticated;
alter table public.map_entities enable row level security;
alter table public.entity_map_placements enable row level security;

comment on function private.map079_public_local_placement_exists(uuid,text,text) is
  'MAP-079 policy-only predicate: published local placement, context, geography binding, canonical public entity/category and active same campaign.';

commit;
