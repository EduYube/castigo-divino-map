begin;

-- PostgreSQL's NULLIF is SQL syntax, not a pg_catalog function. Keep the
-- hardened function bodies from MAP-053 while expressing NULLIF in the form
-- understood by plpgsql_check/Supabase db lint. This migration intentionally
-- runs before the temporary moderator-role membership is revoked.
create or replace function public.submit_public_request_v2(
  p_campaign_id uuid,
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
  sender_name_value text := pg_catalog.btrim(p_sender_name);
  proposed_name_value text := pg_catalog.btrim(p_proposed_name);
  description_value text := pg_catalog.btrim(p_description);
  reason_value text := pg_catalog.btrim(p_reason);
begin
  if nullif(pg_catalog.btrim(p_honeypot), '') is not null then
    return true;
  end if;

  if not exists (
    select 1
    from public.campaigns campaign
    where campaign.id = p_campaign_id
      and campaign.status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'invalid campaign';
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
    p_campaign_id,
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

create or replace function public.admin_moderate_public_request(
  p_request_id uuid,
  p_expected_updated_at timestamptz,
  p_action text,
  p_moderation_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.public_requests%rowtype;
  result_record public.public_requests%rowtype;
  normalized_note text := nullif(pg_catalog.btrim(p_moderation_note), '');
  draft_entity_id text;
  draft_slug text;
begin
  if not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'administrative authorization required';
  end if;

  if p_action is null or p_action not in ('reject', 'convert') then
    raise exception using errcode = '23514', message = 'unsupported public request moderation action';
  end if;

  select request.*
  into request_record
  from public.public_requests as request
  where request.id = p_request_id
  for update;

  if not found
     or request_record.request_status <> 'pending'
     or p_expected_updated_at is null
     or request_record.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'public request changed or was already processed';
  end if;

  if p_action = 'reject' then
    update public.public_requests as request
    set request_status = 'rejected', moderation_note = normalized_note
    where request.id = p_request_id
    returning request.* into result_record;

    return pg_catalog.jsonb_build_object(
      'request', pg_catalog.to_jsonb(result_record),
      'draft_entity_id', null
    );
  end if;

  draft_entity_id := 'entity-request-' || pg_catalog.replace(p_request_id::text, '-', '');
  draft_slug := 'request-' || pg_catalog.replace(p_request_id::text, '-', '');

  insert into public.map_entities (
    campaign_id,
    id,
    slug,
    entity_type,
    visibility,
    name,
    name_language,
    summary,
    description,
    x,
    y,
    category_id,
    publication_status
  ) values (
    request_record.campaign_id,
    draft_entity_id,
    draft_slug,
    request_record.entity_type,
    'pin',
    request_record.proposed_name,
    'en',
    '',
    request_record.description,
    request_record.x,
    request_record.y,
    null,
    'draft'
  );

  update public.public_requests as request
  set request_status = 'accepted', moderation_note = normalized_note
  where request.id = p_request_id;

  update public.public_requests as request
  set request_status = 'converted',
      converted_entity_id = draft_entity_id,
      moderation_note = normalized_note
  where request.id = p_request_id
  returning request.* into result_record;

  return pg_catalog.jsonb_build_object(
    'request', pg_catalog.to_jsonb(result_record),
    'draft_entity_id', draft_entity_id
  );
end;
$$;

commit;
