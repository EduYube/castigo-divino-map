-- MAP-027: administrative moderation and atomic conversion of public requests.
--
-- The browser remains an untrusted client. Direct moderation-column writes are
-- revoked from authenticated. The RPC runs as a dedicated NOLOGIN role that has
-- only the extra column privilege required by this operation and does not bypass
-- RLS, so the existing administrative policies remain authoritative.
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

do $$
declare
  moderator_role pg_catalog.pg_roles%rowtype;
begin
  select *
  into moderator_role
  from pg_catalog.pg_roles
  where rolname = 'atlas_public_request_moderator';

  if not found then
    create role atlas_public_request_moderator
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls
      inherit;
  elsif moderator_role.rolcanlogin
     or moderator_role.rolsuper
     or moderator_role.rolcreatedb
     or moderator_role.rolcreaterole
     or moderator_role.rolreplication
     or moderator_role.rolbypassrls
     or not moderator_role.rolinherit then
    raise exception using
      errcode = '42501',
      message = 'atlas_public_request_moderator role is not hardened as required';
  end if;
end;
$$;

-- The dedicated RPC owner inherits the existing authenticated grants and RLS
-- policy membership, while browser sessions do not inherit this dedicated role.
grant authenticated to atlas_public_request_moderator;

-- Moderation state and audit notes must only change through the atomic RPC.
revoke update (request_status, moderation_note, converted_entity_id)
  on public.public_requests
  from authenticated;

grant update (request_status, moderation_note, converted_entity_id)
  on public.public_requests
  to atlas_public_request_moderator;

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

-- PostgreSQL grants EXECUTE to PUBLIC on new functions by default. Close that
-- surface before transferring ownership to the dedicated least-privilege role.
revoke all on function public.admin_moderate_public_request(uuid, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_moderate_public_request(uuid, timestamptz, text, text)
  to authenticated;

comment on function public.admin_moderate_public_request(uuid, timestamptz, text, text) is
  'Atomically rejects a pending public request or converts it into an uncategorized draft pin. Direct browser updates are revoked; the dedicated NOLOGIN owner remains subject to the existing administrative RLS policies.';

-- PostgreSQL requires the new owner to have CREATE on the containing schema at
-- ownership-transfer time. Grant it only inside this migration transaction and
-- revoke it again before commit.
grant create on schema public to atlas_public_request_moderator;
alter function public.admin_moderate_public_request(uuid, timestamptz, text, text)
  owner to atlas_public_request_moderator;
revoke create on schema public from atlas_public_request_moderator;
