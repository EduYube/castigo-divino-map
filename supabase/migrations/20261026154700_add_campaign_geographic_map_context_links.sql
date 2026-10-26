begin;

-- MAP-077: a physical surface is global; the entrance is campaign-scoped.
-- Neverwinter is an existing geographic_name, not a new map_entity.
create table public.campaign_geographic_map_context_links (
  campaign_id uuid not null references public.campaigns(id)
    on update restrict on delete restrict,
  geographic_name_id text not null references public.geographic_names(id)
    on update restrict on delete restrict,
  map_context_id text not null references public.map_contexts(id)
    on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  primary key (campaign_id, geographic_name_id)
);

create index campaign_geographic_map_context_links_context_idx
  on public.campaign_geographic_map_context_links(map_context_id);

alter table public.campaign_geographic_map_context_links enable row level security;

create policy campaign_geographic_map_context_links_public_read
on public.campaign_geographic_map_context_links
for select to anon, authenticated
using (
  exists (
    select 1 from public.campaigns campaign
    where campaign.id = campaign_id and campaign.status = 'active'
  )
  and exists (
    select 1 from public.geographic_names geography
    where geography.id = geographic_name_id
      and geography.publication_status = 'published'::public.publication_status
  )
  and exists (
    select 1 from public.map_contexts context
    where context.id = map_context_id
      and context.publication_status = 'published'::public.publication_status
  )
);

create policy campaign_geographic_map_context_links_admin_write
on public.campaign_geographic_map_context_links
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

-- INFRA #210: no inherited table grants, no public or service role writes.
revoke all on public.campaign_geographic_map_context_links
  from public, anon, authenticated, service_role;
grant select on public.campaign_geographic_map_context_links to anon, authenticated;
grant insert (campaign_id, geographic_name_id, map_context_id)
  on public.campaign_geographic_map_context_links to authenticated;
grant update (map_context_id)
  on public.campaign_geographic_map_context_links to authenticated;
grant delete on public.campaign_geographic_map_context_links to authenticated;

insert into public.map_contexts (
  id, slug, name, parent_id, width, height, publication_status,
  image_uri, loading_strategy, license_notes
) values (
  'map-neverwinter', 'neverwinter', 'Neverwinter', null, 2048, 1582,
  'published', null, null, 'RIGHTS_METADATA_PENDING — selected raster not cleared for distribution'
);

insert into public.campaign_geographic_map_context_links (
  campaign_id, geographic_name_id, map_context_id
) values (
  '00000000-0000-4000-8000-000000000068', 'geo-neverwinter', 'map-neverwinter'
);

comment on table public.campaign_geographic_map_context_links is
  'Campaign-scoped entrance from an existing global geography to a shared physical map context.';

commit;
