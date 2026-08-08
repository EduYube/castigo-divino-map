-- MAP-027: administrative moderation and atomic conversion of public requests.
--
-- The browser remains an untrusted SECURITY INVOKER client. RLS, explicit grants,
-- constraints and triggers continue to authorize and validate every table write.
-- A converted request creates an intentionally incomplete draft: category and tags
-- remain editorial decisions and are never inferred from public input.

alter table public.map_entities
  alter column category_id drop not null;

alter table public.map_entities
  add constraint map_entities_published_category_required
  check (publication_status <> 'published' or category_id is not null)
  not valid;

alter table public.map_entities
  validate constraint map_entities_published_category_required;

create or replace function public.admin_moderate_public_request(
  p_request_id uuid,
  p_expected_updated_at timestamptz,
  p_action text,
  p_moderation_note text default null
)
returns jsonb
language plpgsql
security invoker
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
    raise exception using
      errcode = '42501',
      message = 'administrative authorization required';
  end if;

  if p_action is null or p_action not in ('reject', 'convert') then
    raise exception using
      errcode = '23514',
      message = 'unsupported public request moderation action';
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
    raise exception using
      errcode = '40001',
      message = 'public request changed or was already processed';
  end if;

  if p_action = 'reject' then
    update public.public_requests as request
    set request_status = 'rejected',
        moderation_note = normalized_note
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

  -- Preserve the state machine introduced before MAP-027 without exposing an
  -- externally observable intermediate state: both transitions commit atomically.
  update public.public_requests as request
  set request_status = 'accepted',
      moderation_note = normalized_note
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

revoke all on function public.admin_moderate_public_request(uuid, timestamptz, text, text)
  from public, anon;
grant execute on function public.admin_moderate_public_request(uuid, timestamptz, text, text)
  to authenticated;

comment on function public.admin_moderate_public_request(uuid, timestamptz, text, text) is
  'Atomically rejects a pending public request or converts it into an uncategorized draft pin under RLS, with optimistic concurrency and database-owned audit fields.';
