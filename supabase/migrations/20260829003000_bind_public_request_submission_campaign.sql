-- MAP-056 security follow-up: bind anonymous public-request submission to a
-- backend-issued campaign capability instead of trusting a caller supplied UUID.
--
-- The browser is untrusted. begin_public_request_submission() validates the active
-- campaign and returns an opaque HMAC-bound capability. submit_public_request_v3()
-- derives the campaign exclusively from that signed capability, rejects tampering,
-- and records each nonce once so a successful capability cannot be replayed.
-- Legacy public submission entrypoints are removed from the executable surface.

begin;

create extension if not exists pgcrypto with schema extensions;

do $$
declare
  submitter_role pg_catalog.pg_roles%rowtype;
begin
  select *
  into submitter_role
  from pg_catalog.pg_roles
  where rolname = 'atlas_public_request_submitter';

  if not found then
    create role atlas_public_request_submitter
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls
      inherit;
  elsif submitter_role.rolcanlogin
     or submitter_role.rolsuper
     or submitter_role.rolcreatedb
     or submitter_role.rolcreaterole
     or submitter_role.rolreplication
     or submitter_role.rolbypassrls
     or not submitter_role.rolinherit then
    raise exception using
      errcode = '42501',
      message = 'atlas_public_request_submitter role is not hardened as required';
  end if;
end;
$$;

create table private.public_request_submission_secret (
  singleton boolean primary key default true,
  secret bytea not null,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  constraint public_request_submission_secret_singleton_check check (singleton)
);

insert into private.public_request_submission_secret (singleton, secret)
values (true, extensions.gen_random_bytes(32));

create table private.public_request_submission_nonces (
  nonce uuid primary key,
  consumed_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now())
);

alter table private.public_request_submission_secret enable row level security;
alter table private.public_request_submission_nonces enable row level security;

revoke all on private.public_request_submission_secret from public, anon, authenticated;
revoke all on private.public_request_submission_nonces from public, anon, authenticated;

grant usage on schema public, private, extensions to atlas_public_request_submitter;
grant select on public.campaigns to atlas_public_request_submitter;
grant insert (
  campaign_id,
  sender_name,
  proposed_name,
  entity_type,
  x,
  y,
  description,
  reason,
  request_status,
  moderator_user_id,
  moderation_note,
  converted_entity_id,
  moderated_at
) on public.public_requests to atlas_public_request_submitter;
grant select on private.public_request_submission_secret to atlas_public_request_submitter;
grant insert on private.public_request_submission_nonces to atlas_public_request_submitter;

create policy campaigns_public_request_submitter_select
on public.campaigns
for select
to atlas_public_request_submitter
using (status = 'active');

create policy public_requests_public_submitter_insert
on public.public_requests
for insert
to atlas_public_request_submitter
with check (
  request_status = 'pending'
  and moderator_user_id is null
  and moderation_note is null
  and converted_entity_id is null
  and moderated_at is null
  and exists (
    select 1
    from public.campaigns campaign
    where campaign.id = public_requests.campaign_id
      and campaign.status = 'active'
  )
);

create policy public_request_submission_secret_submitter_select
on private.public_request_submission_secret
for select
to atlas_public_request_submitter
using (singleton);

create policy public_request_submission_nonces_submitter_insert
on private.public_request_submission_nonces
for insert
to atlas_public_request_submitter
with check (true);

create or replace function public.begin_public_request_submission(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_record public.campaigns%rowtype;
  signing_secret bytea;
  nonce_value uuid := extensions.gen_random_uuid();
  expires_epoch bigint := pg_catalog.floor(
    pg_catalog.extract(epoch from pg_catalog.clock_timestamp() + interval '15 minutes')
  )::bigint;
  payload text;
  signature text;
begin
  select campaign.*
  into campaign_record
  from public.campaigns campaign
  where campaign.id = p_campaign_id
    and campaign.status = 'active';

  if not found then
    raise exception using errcode = '22023', message = 'invalid campaign';
  end if;

  select secret_row.secret
  into signing_secret
  from private.public_request_submission_secret secret_row
  where secret_row.singleton;

  if signing_secret is null then
    raise exception using errcode = '55000', message = 'public request submission unavailable';
  end if;

  payload := campaign_record.id::text || '.' || expires_epoch::text || '.' || nonce_value::text;
  signature := pg_catalog.encode(
    extensions.hmac(pg_catalog.convert_to(payload, 'UTF8'), signing_secret, 'sha256'),
    'hex'
  );

  return pg_catalog.jsonb_build_object(
    'campaign_id', campaign_record.id,
    'campaign_slug', campaign_record.slug,
    'campaign_name', campaign_record.name,
    'submission_token', payload || '.' || signature,
    'expires_at', pg_catalog.to_timestamp(expires_epoch)
  );
end;
$$;

create or replace function public.submit_public_request_v3(
  p_submission_token text,
  p_sender_name text,
  p_proposed_name text,
  p_entity_type public.entity_type,
  p_x double precision,
  p_y double precision,
  p_description text,
  p_reason text,
  p_honeypot text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_parts text[];
  campaign_id_value uuid;
  expires_epoch bigint;
  nonce_value uuid;
  supplied_signature text;
  expected_signature text;
  payload text;
  signing_secret bytea;
  sender_name_value text := pg_catalog.btrim(p_sender_name);
  proposed_name_value text := pg_catalog.btrim(p_proposed_name);
  description_value text := pg_catalog.btrim(p_description);
  reason_value text := pg_catalog.btrim(p_reason);
begin
  token_parts := pg_catalog.string_to_array(pg_catalog.coalesce(p_submission_token, ''), '.');
  if pg_catalog.array_length(token_parts, 1) <> 4 then
    raise exception using errcode = '22023', message = 'invalid public request submission token';
  end if;

  begin
    campaign_id_value := token_parts[1]::uuid;
    expires_epoch := token_parts[2]::bigint;
    nonce_value := token_parts[3]::uuid;
    supplied_signature := token_parts[4];
  exception
    when others then
      raise exception using errcode = '22023', message = 'invalid public request submission token';
  end;

  if supplied_signature !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid public request submission token';
  end if;

  payload := campaign_id_value::text || '.' || expires_epoch::text || '.' || nonce_value::text;

  select secret_row.secret
  into signing_secret
  from private.public_request_submission_secret secret_row
  where secret_row.singleton;

  if signing_secret is null then
    raise exception using errcode = '55000', message = 'public request submission unavailable';
  end if;

  expected_signature := pg_catalog.encode(
    extensions.hmac(pg_catalog.convert_to(payload, 'UTF8'), signing_secret, 'sha256'),
    'hex'
  );

  if extensions.digest(pg_catalog.convert_to(supplied_signature, 'UTF8'), 'sha256')
     <> extensions.digest(pg_catalog.convert_to(expected_signature, 'UTF8'), 'sha256') then
    raise exception using errcode = '22023', message = 'invalid public request submission token';
  end if;

  if expires_epoch < pg_catalog.floor(pg_catalog.extract(epoch from pg_catalog.clock_timestamp()))::bigint
     or expires_epoch > pg_catalog.floor(
       pg_catalog.extract(epoch from pg_catalog.clock_timestamp() + interval '20 minutes')
     )::bigint then
    raise exception using errcode = '22023', message = 'invalid public request submission token';
  end if;

  if not exists (
    select 1
    from public.campaigns campaign
    where campaign.id = campaign_id_value
      and campaign.status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'invalid campaign';
  end if;

  begin
    insert into private.public_request_submission_nonces (nonce)
    values (nonce_value);
  exception
    when unique_violation then
      raise exception using errcode = '22023', message = 'invalid public request submission token';
  end;

  if pg_catalog.nullif(pg_catalog.btrim(p_honeypot), '') is not null then
    return true;
  end if;

  if pg_catalog.char_length(sender_name_value) not between 1 and 80
     or pg_catalog.char_length(proposed_name_value) not between 1 and 160
     or pg_catalog.char_length(description_value) not between 1 and 2000
     or pg_catalog.char_length(reason_value) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid public request';
  end if;

  if p_x not between 0 and 3600
     or p_x in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
     or p_y not between 0 and 2329
     or p_y in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision) then
    raise exception using errcode = '22023', message = 'invalid public request';
  end if;

  insert into public.public_requests (
    campaign_id,
    sender_name,
    proposed_name,
    entity_type,
    x,
    y,
    description,
    reason,
    request_status,
    moderator_user_id,
    moderation_note,
    converted_entity_id,
    moderated_at
  ) values (
    campaign_id_value,
    sender_name_value,
    proposed_name_value,
    p_entity_type,
    p_x,
    p_y,
    description_value,
    reason_value,
    'pending',
    null,
    null,
    null,
    null
  );

  return true;
end;
$$;

revoke all on function public.begin_public_request_submission(uuid)
  from public, anon, authenticated;
revoke all on function public.submit_public_request_v3(
  text, text, text, public.entity_type, double precision, double precision, text, text, text
) from public, anon, authenticated;

grant execute on function public.begin_public_request_submission(uuid) to anon, authenticated;
grant execute on function public.submit_public_request_v3(
  text, text, text, public.entity_type, double precision, double precision, text, text, text
) to anon, authenticated;

comment on function public.begin_public_request_submission(uuid) is
  'MAP-056 backend campaign binding for anonymous public requests. Returns a short-lived signed capability only for an active campaign.';
comment on function public.submit_public_request_v3(text, text, text, public.entity_type, double precision, double precision, text, text, text) is
  'MAP-056 authoritative anonymous request ingress. Campaign scope is derived only from a short-lived signed one-time capability; no caller-supplied campaign id is accepted.';

-- Transfer the two public SECURITY DEFINER functions to a hardened NOLOGIN owner
-- that has only the table privileges and RLS policies required for this flow.
grant atlas_public_request_submitter to current_user;
grant create on schema public to atlas_public_request_submitter;
alter function public.begin_public_request_submission(uuid)
  owner to atlas_public_request_submitter;
alter function public.submit_public_request_v3(
  text, text, text, public.entity_type, double precision, double precision, text, text, text
) owner to atlas_public_request_submitter;
revoke create on schema public from atlas_public_request_submitter;
revoke atlas_public_request_submitter from current_user;

-- The old public endpoints trusted caller-controlled campaign scope (or silently
-- forced the initial campaign). They are not compatibility APIs anymore: remove
-- every grant and drop them so PostgREST cannot expose an alternate ingress path.
revoke all on function public.submit_public_request(
  text, text, public.entity_type, double precision, double precision, text, text, text
) from public, anon, authenticated;
revoke all on function public.submit_public_request_v2(
  uuid, text, text, public.entity_type, double precision, double precision, text, text, text
) from public, anon, authenticated;
drop function public.submit_public_request(
  text, text, public.entity_type, double precision, double precision, text, text, text
);
drop function public.submit_public_request_v2(
  uuid, text, text, public.entity_type, double precision, double precision, text, text, text
);

commit;
