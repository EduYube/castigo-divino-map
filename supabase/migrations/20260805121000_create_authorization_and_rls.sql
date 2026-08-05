-- MAP-014: administrative allowlist, explicit grants, and Row Level Security.

create table private.admin_users (
  user_id uuid primary key references auth.users (id)
    on update restrict on delete cascade,
  created_at timestamp with time zone not null default timezone('utc', now())
);

alter table private.admin_users enable row level security;
alter table private.reserved_public_identifiers enable row level security;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.admin_users as admin_user
    where admin_user.user_id = auth.uid()
  );
$$;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;

revoke all on private.admin_users from public, anon, authenticated;
revoke all on private.reserved_public_identifiers from public, anon, authenticated;
revoke all on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;

alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.map_entities enable row level security;
alter table public.entity_aliases enable row level security;
alter table public.entity_tags enable row level security;
alter table public.public_notes enable row level security;
alter table public.character_locations enable row level security;
alter table public.geographic_names enable row level security;
alter table public.public_requests enable row level security;

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on public.categories to anon, authenticated;
grant select on public.tags to anon, authenticated;
grant select on public.map_entities to anon, authenticated;
grant select on public.entity_aliases to anon, authenticated;
grant select on public.entity_tags to anon, authenticated;
grant select on public.public_notes to anon, authenticated;
grant select on public.character_locations to anon, authenticated;
grant select on public.geographic_names to anon, authenticated;

grant insert, update, delete on public.categories to authenticated;
grant insert, update, delete on public.tags to authenticated;
grant insert, update, delete on public.map_entities to authenticated;
grant insert, update, delete on public.entity_aliases to authenticated;
grant insert, update, delete on public.entity_tags to authenticated;
grant insert, update, delete on public.public_notes to authenticated;
grant insert, update, delete on public.character_locations to authenticated;
grant insert, update, delete on public.geographic_names to authenticated;

grant select, update, delete on public.public_requests to authenticated;

create policy categories_public_select
on public.categories
for select
to anon, authenticated
using (publication_status = 'published');

create policy categories_admin_select
on public.categories
for select
to authenticated
using ((select private.is_admin()));

create policy categories_admin_insert
on public.categories
for insert
to authenticated
with check ((select private.is_admin()));

create policy categories_admin_update
on public.categories
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy categories_admin_delete
on public.categories
for delete
to authenticated
using ((select private.is_admin()));

create policy tags_public_select
on public.tags
for select
to anon, authenticated
using (publication_status = 'published');

create policy tags_admin_select
on public.tags
for select
to authenticated
using ((select private.is_admin()));

create policy tags_admin_insert
on public.tags
for insert
to authenticated
with check ((select private.is_admin()));

create policy tags_admin_update
on public.tags
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy tags_admin_delete
on public.tags
for delete
to authenticated
using ((select private.is_admin()));

create policy map_entities_public_select
on public.map_entities
for select
to anon, authenticated
using (
  publication_status = 'published'
  and exists (
    select 1
    from public.categories as category
    where category.id = map_entities.category_id
      and category.publication_status = 'published'
  )
);

create policy map_entities_admin_select
on public.map_entities
for select
to authenticated
using ((select private.is_admin()));

create policy map_entities_admin_insert
on public.map_entities
for insert
to authenticated
with check ((select private.is_admin()));

create policy map_entities_admin_update
on public.map_entities
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy map_entities_admin_delete
on public.map_entities
for delete
to authenticated
using ((select private.is_admin()));

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
  )
);

create policy entity_aliases_admin_select
on public.entity_aliases
for select
to authenticated
using ((select private.is_admin()));

create policy entity_aliases_admin_insert
on public.entity_aliases
for insert
to authenticated
with check ((select private.is_admin()));

create policy entity_aliases_admin_update
on public.entity_aliases
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy entity_aliases_admin_delete
on public.entity_aliases
for delete
to authenticated
using ((select private.is_admin()));

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
      and tag.publication_status = 'published'
  )
);

create policy entity_tags_admin_select
on public.entity_tags
for select
to authenticated
using ((select private.is_admin()));

create policy entity_tags_admin_insert
on public.entity_tags
for insert
to authenticated
with check ((select private.is_admin()));

create policy entity_tags_admin_update
on public.entity_tags
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy entity_tags_admin_delete
on public.entity_tags
for delete
to authenticated
using ((select private.is_admin()));

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
  )
);

create policy public_notes_admin_select
on public.public_notes
for select
to authenticated
using ((select private.is_admin()));

create policy public_notes_admin_insert
on public.public_notes
for insert
to authenticated
with check ((select private.is_admin()));

create policy public_notes_admin_update
on public.public_notes
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy public_notes_admin_delete
on public.public_notes
for delete
to authenticated
using ((select private.is_admin()));

create policy character_locations_public_select
on public.character_locations
for select
to anon, authenticated
using (
  publication_status = 'published'
  and exists (
    select 1
    from public.map_entities as character
    join public.map_entities as location
      on location.id = character_locations.location_id
    where character.id = character_locations.character_id
      and character.publication_status = 'published'
      and location.publication_status = 'published'
  )
);

create policy character_locations_admin_select
on public.character_locations
for select
to authenticated
using ((select private.is_admin()));

create policy character_locations_admin_insert
on public.character_locations
for insert
to authenticated
with check ((select private.is_admin()));

create policy character_locations_admin_update
on public.character_locations
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy character_locations_admin_delete
on public.character_locations
for delete
to authenticated
using ((select private.is_admin()));

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
    )
  )
);

create policy geographic_names_admin_select
on public.geographic_names
for select
to authenticated
using ((select private.is_admin()));

create policy geographic_names_admin_insert
on public.geographic_names
for insert
to authenticated
with check ((select private.is_admin()));

create policy geographic_names_admin_update
on public.geographic_names
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy geographic_names_admin_delete
on public.geographic_names
for delete
to authenticated
using ((select private.is_admin()));

create policy public_requests_admin_select
on public.public_requests
for select
to authenticated
using ((select private.is_admin()));

create policy public_requests_admin_update
on public.public_requests
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy public_requests_admin_delete
on public.public_requests
for delete
to authenticated
using ((select private.is_admin()));

alter default privileges in schema public
  revoke all on tables from anon, authenticated;

alter default privileges in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges in schema private
  revoke all on tables from public, anon, authenticated;

alter default privileges in schema private
  revoke execute on functions from public, anon, authenticated;
