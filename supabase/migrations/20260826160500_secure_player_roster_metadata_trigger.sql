begin;

-- The roster metadata trigger fires under the role performing the DML. Its
-- contrast helper is intentionally private and not executable by application
-- roles, so the trigger itself must execute with its owner's privileges. Keep
-- a fixed empty search_path and fully qualify every referenced object/function.
create or replace function private.normalize_player_roster_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.accent_color := pg_catalog.lower(pg_catalog.btrim(new.accent_color));

  if new.accent_color !~ '^#[0-9a-f]{6}$' then
    raise exception using errcode = '23514', message = 'player accent_color must be a normalized six-digit hex value';
  end if;

  if private.player_accent_contrast_on_white(new.accent_color) < 3.0 then
    raise exception using errcode = '23514', message = 'player accent_color must have at least 3:1 contrast on white';
  end if;

  return new;
end;
$$;

revoke all on function private.normalize_player_roster_metadata() from public;

commit;
