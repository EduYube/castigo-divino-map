begin;

-- MAP-053 follow-up hardening: campaign lifecycle timestamps remain database-owned,
-- matching the v1.0 editorial lifecycle contract used by every other content table.
revoke insert (archived_at) on table public.campaigns from authenticated;
revoke update (archived_at) on table public.campaigns from authenticated;

create function private.enforce_campaign_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := pg_catalog.btrim(new.name);

  if new.status = 'archived' then
    if tg_op = 'INSERT' or old.status <> 'archived' then
      new.archived_at := pg_catalog.now();
    else
      new.archived_at := old.archived_at;
    end if;
  else
    new.archived_at := null;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_campaign_lifecycle() from public;

create trigger "20_campaign_lifecycle"
before insert or update on public.campaigns
for each row execute function private.enforce_campaign_lifecycle();

commit;
