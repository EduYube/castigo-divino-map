begin;

-- MAP-063 must attach authorship metadata to every historical public note even
-- when its parent entity was subsequently withdrawn. Keep the runtime
-- validation active and bypass it only for the exact four-column authorship
-- backfill performed by the next migration.
create or replace function private.validate_public_note_during_map063_backfill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb;
  new_row jsonb;
begin
  if tg_op = 'UPDATE' then
    old_row := pg_catalog.to_jsonb(old);
    new_row := pg_catalog.to_jsonb(new);

    if old_row ? 'author_kind'
       and new_row ? 'author_kind'
       and old_row ->> 'author_kind' is null
       and new_row ->> 'author_kind' = 'master'
       and old_row ->> 'author_player_id' is null
       and new_row ->> 'author_player_id' is null
       and old_row ->> 'last_modifier_kind' is null
       and new_row ->> 'last_modifier_kind' = 'master'
       and old_row ->> 'last_modifier_player_id' is null
       and new_row ->> 'last_modifier_player_id' is null
       and (
         old_row
           - 'author_kind'
           - 'author_player_id'
           - 'last_modifier_kind'
           - 'last_modifier_player_id'
       ) = (
         new_row
           - 'author_kind'
           - 'author_player_id'
           - 'last_modifier_kind'
           - 'last_modifier_player_id'
       ) then
      return new;
    end if;
  end if;

  if new.publication_status = 'published'::public.publication_status
     and not exists (
       select 1
       from public.map_entities as entity
       where entity.id = new.entity_id
         and entity.publication_status = 'published'::public.publication_status
     ) then
    raise exception using
      errcode = '23514',
      message = 'a published note requires a published entity';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_public_note_during_map063_backfill() from public;

drop trigger if exists "20_validate_public_note" on public.public_notes;
create trigger "20_validate_public_note"
before insert or update on public.public_notes
for each row execute function private.validate_public_note_during_map063_backfill();

commit;
