-- MAP-064 phase 1: close the public proposal ingress before extending the
-- existing functional entity class dimension. The hardening and enum expansion
-- commit atomically, so mission/hazard can never become visible while the legacy
-- public submission RPC still accepts every entity_type enum value.
--
-- Keep uses of the newly-added enum values out of this transaction: PostgreSQL
-- only permits those values to be referenced by later constraints/functions once
-- the ALTER TYPE transaction has committed.

begin;

-- Public proposals deliberately remain a smaller domain than administrative map
-- entities. Install the table invariant while entity_type can still only contain
-- character/location; it remains valid after the enum is widened below.
alter table public.public_requests
  add constraint public_requests_supported_entity_type_check
  check (entity_type in ('character'::public.entity_type, 'location'::public.entity_type));

-- Replace the exposed submission RPC before widening entity_type. The whitelist
-- executes before token parsing or nonce consumption, so once mission/hazard are
-- visible they still cannot cross the public proposal boundary.
grant atlas_public_request_submitter to current_user;

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
  -- Check before token parsing/nonce consumption so unsupported enum values can
  -- never cross the public proposal boundary, even with a manipulated payload.
  if p_entity_type not in ('character'::public.entity_type, 'location'::public.entity_type) then
    raise exception using errcode = '22023', message = 'invalid public request';
  end if;

  token_parts := pg_catalog.string_to_array(coalesce(p_submission_token, ''), '.');
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

  if expires_epoch < pg_catalog.floor(extract(epoch from pg_catalog.clock_timestamp()))::bigint
     or expires_epoch > pg_catalog.floor(
       extract(epoch from pg_catalog.clock_timestamp() + interval '20 minutes')
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

  if nullif(pg_catalog.btrim(p_honeypot), '') is not null then
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
    campaign_id, sender_name, proposed_name, entity_type, x, y, description, reason,
    request_status, moderator_user_id, moderation_note, converted_entity_id, moderated_at
  ) values (
    campaign_id_value, sender_name_value, proposed_name_value, p_entity_type, p_x, p_y,
    description_value, reason_value, 'pending', null, null, null, null
  );

  return true;
end;
$$;

revoke atlas_public_request_submitter from current_user;

alter type public.entity_type add value if not exists 'mission' after 'location';
alter type public.entity_type add value if not exists 'hazard' after 'mission';

commit;
