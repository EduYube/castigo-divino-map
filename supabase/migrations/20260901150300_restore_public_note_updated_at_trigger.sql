begin;

-- The authorship backfill is complete. Restore the established generic timestamp
-- trigger so MAP-063 does not leave a migration-only code path in steady state.
drop trigger "90_public_note_updated_at" on public.public_notes;
create trigger "90_public_note_updated_at"
before update on public.public_notes
for each row execute function private.set_updated_at();

drop function private.set_public_note_updated_at_during_map063_backfill();

commit;
