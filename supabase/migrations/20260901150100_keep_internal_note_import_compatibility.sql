begin;

-- Seed/import paths execute as privileged database roles and predate MAP-063.
-- Keep them backwards compatible without reopening any client write grant. The
-- public/admin RPCs still set authorship explicitly, and anon/authenticated have
-- no direct INSERT privilege on public_notes.
alter table public.public_notes
  alter column author_kind set default 'master'::public.public_note_author_kind,
  alter column last_modifier_kind set default 'master'::public.public_note_author_kind;

commit;
