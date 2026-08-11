-- MAP-045 hardening: a current entity reference protects its Storage object from deletion.
--
-- Replacement/removal first changes map_entities.portrait_path and only then deletes the
-- old unreferenced object. This policy makes that ordering authoritative at Storage RLS too,
-- so a lost response, stale client or manual authenticated request cannot destructively
-- remove the binary while any current entity still points at it.

drop policy if exists character_portraits_admin_delete on storage.objects;
create policy character_portraits_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'character-portraits'
  and private.is_admin()
  and not exists (
    select 1
    from public.map_entities as entity
    where entity.portrait_path = storage.objects.name
  )
);
