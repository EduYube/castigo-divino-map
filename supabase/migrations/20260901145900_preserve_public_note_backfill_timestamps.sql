begin;

-- MAP-063 backfills authorship onto existing v1.0 note rows. The established
-- generic updated_at trigger would otherwise rewrite their historical timestamp
-- even though no user-visible note content is changing. Install a narrowly
-- scoped transition trigger before the authorship columns exist. to_jsonb keeps
-- the function safe if a deployment stops before the next migration adds those
-- columns: ordinary updates still receive the normal updated_at behavior.
create function private.set_public_note_updated_at_during_map063_backfill()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (pg_catalog.to_jsonb(old) ->> 'author_kind') is null
     and (pg_catalog.to_jsonb(new) ->> 'author_kind') = 'master'
     and (pg_catalog.to_jsonb(new) ->> 'last_modifier_kind') = 'master'
     and (pg_catalog.to_jsonb(new) ->> 'author_player_id') is null
     and (pg_catalog.to_jsonb(new) ->> 'last_modifier_player_id') is null then
    new.updated_at := old.updated_at;
  else
    new.updated_at := pg_catalog.timezone('utc', pg_catalog.now());
  end if;

  return new;
end;
$$;

revoke all on function private.set_public_note_updated_at_during_map063_backfill() from public;

drop trigger "90_public_note_updated_at" on public.public_notes;
create trigger "90_public_note_updated_at"
before update on public.public_notes
for each row execute function private.set_public_note_updated_at_during_map063_backfill();

commit;
