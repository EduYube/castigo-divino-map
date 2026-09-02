-- MAP-064 phase 2: functional lifecycle, secured admin editing, Master projection,
-- and defence-in-depth on the public request ingress.

begin;

create type public.entity_lifecycle_status as enum ('active', 'completed', 'failed', 'resolved');

alter table public.map_entities
  add column lifecycle_status public.entity_lifecycle_status;

-- Keep the MAP-060 SECURITY INVOKER model: authenticated callers receive only
-- the lifecycle column privilege required by admin_save_map_entity_v7. RLS and
-- the RPC's explicit admin authorization remain the row-level boundary.
grant update (lifecycle_status) on public.map_entities to authenticated;

create function private.default_map_entity_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.lifecycle_status is null
     and new.entity_type in ('mission'::public.entity_type, 'hazard'::public.entity_type) then
    new.lifecycle_status := 'active'::public.entity_lifecycle_status;
  end if;
  return new;
end;
$$;

revoke all on function private.default_map_entity_lifecycle() from public, anon, authenticated;

create trigger map_entities_default_functional_lifecycle
before insert on public.map_entities
for each row execute function private.default_map_entity_lifecycle();

alter table public.map_entities
  add constraint map_entities_functional_lifecycle_check
  check (
    (entity_type in ('character'::public.entity_type, 'location'::public.entity_type)
      and lifecycle_status is null)
    or (entity_type = 'mission'::public.entity_type
      and lifecycle_status in (
        'active'::public.entity_lifecycle_status,
        'completed'::public.entity_lifecycle_status,
        'failed'::public.entity_lifecycle_status
      ))
    or (entity_type = 'hazard'::public.entity_type
      and lifecycle_status in (
        'active'::public.entity_lifecycle_status,
        'resolved'::public.entity_lifecycle_status
      ))
  );

-- Public proposals remain a deliberately smaller domain than administrative
-- entities. The table check is a second line of defence behind the RPC whitelist.
alter table public.public_requests
  add constraint public_requests_supported_entity_type_check
  check (entity_type in ('character'::public.entity_type, 'location'::public.entity_type));

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

create function public.admin_get_map_entity_editor_v7(
  p_campaign_id uuid,
  p_entity_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  editor jsonb;
  entity_lifecycle public.entity_lifecycle_status;
begin
  editor := public.admin_get_map_entity_editor_v6(p_campaign_id, p_entity_id);

  select entity.lifecycle_status
  into entity_lifecycle
  from public.map_entities as entity
  where entity.id = p_entity_id
    and entity.campaign_id = p_campaign_id;

  return pg_catalog.jsonb_set(
    editor,
    '{record,lifecycleStatus}',
    coalesce(pg_catalog.to_jsonb(entity_lifecycle), 'null'::jsonb),
    true
  );
end;
$$;

revoke all on function public.admin_get_map_entity_editor_v7(uuid, text) from public, anon;
grant execute on function public.admin_get_map_entity_editor_v7(uuid, text) to authenticated;

create function public.admin_save_map_entity_v7(
  p_campaign_id uuid,
  p_id text,
  p_expected_updated_at timestamptz,
  p_expected_relations_revision text,
  p_slug text,
  p_entity_type public.entity_type,
  p_visibility public.map_visibility,
  p_audience public.entity_audience,
  p_portrait_path text,
  p_name text,
  p_summary text,
  p_description text,
  p_geometry jsonb,
  p_category_id text,
  p_publication_status public.publication_status,
  p_tag_ids text[],
  p_dispositions jsonb,
  p_player_association_ids text[],
  p_lifecycle_status public.entity_lifecycle_status
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_lifecycle public.entity_lifecycle_status := p_lifecycle_status;
begin
  if not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'administrative authorization required';
  end if;

  if p_entity_type in ('character'::public.entity_type, 'location'::public.entity_type) then
    if normalized_lifecycle is not null then
      raise exception using errcode = '23514', message = 'legacy entity class cannot carry functional lifecycle';
    end if;
  elsif p_entity_type = 'mission'::public.entity_type then
    normalized_lifecycle := coalesce(normalized_lifecycle, 'active'::public.entity_lifecycle_status);
    if normalized_lifecycle not in (
      'active'::public.entity_lifecycle_status,
      'completed'::public.entity_lifecycle_status,
      'failed'::public.entity_lifecycle_status
    ) then
      raise exception using errcode = '23514', message = 'invalid mission lifecycle';
    end if;
  elsif p_entity_type = 'hazard'::public.entity_type then
    normalized_lifecycle := coalesce(normalized_lifecycle, 'active'::public.entity_lifecycle_status);
    if normalized_lifecycle not in (
      'active'::public.entity_lifecycle_status,
      'resolved'::public.entity_lifecycle_status
    ) then
      raise exception using errcode = '23514', message = 'invalid hazard lifecycle';
    end if;
  else
    raise exception using errcode = '23514', message = 'unsupported entity class';
  end if;

  -- Match MAP-058/MAP-060 lock ordering. The same transaction-level advisory lock
  -- is re-entrant when v6 acquires it again.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin-map-entity:' || p_id, 0)
  );

  perform public.admin_save_map_entity_v6(
    p_campaign_id, p_id, p_expected_updated_at, p_expected_relations_revision,
    p_slug, p_entity_type, p_visibility, p_audience, p_portrait_path,
    p_name, p_summary, p_description, p_geometry, p_category_id,
    p_publication_status, p_tag_ids, p_dispositions, p_player_association_ids
  );

  update public.map_entities as entity
  set lifecycle_status = normalized_lifecycle
  where entity.id = p_id
    and entity.campaign_id = p_campaign_id
    and entity.lifecycle_status is distinct from normalized_lifecycle;

  return public.admin_get_map_entity_editor_v7(p_campaign_id, p_id);
end;
$$;

revoke all on function public.admin_save_map_entity_v7(
  uuid, text, timestamptz, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, jsonb, text,
  public.publication_status, text[], jsonb, text[], public.entity_lifecycle_status
) from public, anon;
grant execute on function public.admin_save_map_entity_v7(
  uuid, text, timestamptz, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, jsonb, text,
  public.publication_status, text[], jsonb, text[], public.entity_lifecycle_status
) to authenticated;

create function public.admin_get_master_catalog_v6(p_campaign_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
  entities jsonb;
begin
  result := public.admin_get_master_catalog_v5(p_campaign_id);

  select coalesce(pg_catalog.jsonb_agg(
    source_entity.value || pg_catalog.jsonb_build_object('lifecycleStatus', entity.lifecycle_status)
    order by entity.id
  ), '[]'::jsonb)
  into entities
  from pg_catalog.jsonb_array_elements(result -> 'entities') as source_entity(value)
  join public.map_entities as entity
    on entity.id = source_entity.value ->> 'id'
   and entity.campaign_id = p_campaign_id;

  return pg_catalog.jsonb_set(result, '{entities}', entities, true);
end;
$$;

revoke all on function public.admin_get_master_catalog_v6(uuid) from public, anon;
grant execute on function public.admin_get_master_catalog_v6(uuid) to authenticated;

comment on type public.entity_lifecycle_status is
  'MAP-064 functional lifecycle. Valid values are constrained by entity_type and remain independent from publication_status.';
comment on column public.map_entities.lifecycle_status is
  'MAP-064 mission/hazard lifecycle. NULL for character/location; never substitutes publication archived state.';
comment on function public.admin_save_map_entity_v7(
  uuid, text, timestamptz, text, text, public.entity_type, public.map_visibility,
  public.entity_audience, text, text, text, text, jsonb, text,
  public.publication_status, text[], jsonb, text[], public.entity_lifecycle_status
) is
  'MAP-064 campaign-scoped atomic admin save with independent functional lifecycle.';
comment on function public.admin_get_master_catalog_v6(uuid) is
  'MAP-064 authorized campaign-scoped Master catalog including functional lifecycle.';

commit;
