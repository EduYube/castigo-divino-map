begin;

create or replace function private.enforce_public_note_author_session_mode()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Anonymous visitors have no auth.uid(): player authorship remains declarative.
  -- Once a Supabase session exists, an authorized Master may only create Master
  -- authored rows and a non-admin session may never create a Master-authored row.
  if auth.uid() is not null then
    if private.is_admin() and new.author_kind <> 'master'::public.public_note_author_kind then
      raise exception using errcode = '42501', message = 'administrative note authorship must be Master';
    end if;
    if not private.is_admin() and new.author_kind = 'master'::public.public_note_author_kind then
      raise exception using errcode = '42501', message = 'Master note authorship requires admin authorization';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_public_note_author_session_mode() from public;

create trigger "25_public_note_author_session_mode"
before insert on public.public_notes
for each row execute function private.enforce_public_note_author_session_mode();

commit;
