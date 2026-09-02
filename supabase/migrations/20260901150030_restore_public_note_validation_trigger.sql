begin;

-- Restore the standard runtime validator immediately after the authorship
-- backfill. The transient helper is deliberately not retained in the final
-- schema.
drop trigger if exists "20_validate_public_note" on public.public_notes;
create trigger "20_validate_public_note"
before insert or update on public.public_notes
for each row execute function private.validate_public_note();

drop function if exists private.validate_public_note_during_map063_backfill();

commit;
