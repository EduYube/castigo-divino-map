-- MAP-056: make campaign scope authoritative for public-request moderation.
--
-- MAP-054 introduced admin_moderate_public_request_v2 as a campaign-aware wrapper,
-- but the older unscoped SECURITY DEFINER function remained executable by
-- authenticated callers. A manipulated administrative client could therefore skip
-- the selected campaign argument entirely. This forward-only hardening makes v2 the
-- sole executable moderation entrypoint and keeps the MAP-027 least-privilege owner.
--
-- The browser remains untrusted. The dedicated NOLOGIN owner is intentionally not
-- SUPERUSER and does not BYPASSRLS; SECURITY DEFINER exists only to cross the
-- column-level UPDATE grants that are revoked from browser sessions. Existing admin
-- RLS and the explicit current_user_is_admin() check remain authoritative.

begin;

create or replace function public.admin_moderate_public_request_v2(
  p_campaign_id uuid,
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

  -- Lock only the request in the selected campaign. A request from another campaign
  -- is deliberately indistinguishable from an unknown request to this RPC.
  select request.*
  into request_record
  from public.public_requests as request
  where request.id = p_request_id
    and request.campaign_id = p_campaign_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'request does not belong to selected campaign';
  end if;

  if request_record.request_status <> 'pending'
     or p_expected_updated_at is null
     or request_record.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'public request changed or was already processed';
  end if;

  if p_action = 'reject' then
    update public.public_requests as request
    set request_status = 'rejected', moderation_note = normalized_note
    where request.id = p_request_id
      and request.campaign_id = request_record.campaign_id
    returning request.* into result_record;

    return pg_catalog.jsonb_build_object(
      'request', pg_catalog.to_jsonb(result_record),
      'draft_entity_id', null
    );
  end if;

  draft_entity_id := 'entity-request-' || pg_catalog.replace(p_request_id::text, '-', '');
  draft_slug := 'request-' || pg_catalog.replace(p_request_id::text, '-', '');

  -- The entity campaign comes only from the locked request. The RPC accepts no
  -- category, tag, player, relationship, converted_entity_id or audience input.
  -- Public audience is explicit so anonymous input can never create Master content.
  insert into public.map_entities (
    campaign_id,
    id,
    slug,
    entity_type,
    visibility,
    audience,
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
    'public',
    request_record.proposed_name,
    'en',
    '',
    request_record.description,
    request_record.x,
    request_record.y,
    null,
    'draft'
  );

  -- Preserve the established accepted -> converted state machine inside this one
  -- transaction; no externally observable accepted state is committed.
  update public.public_requests as request
  set request_status = 'accepted', moderation_note = normalized_note
  where request.id = p_request_id
    and request.campaign_id = request_record.campaign_id;

  update public.public_requests as request
  set request_status = 'converted',
      converted_entity_id = draft_entity_id,
      moderation_note = normalized_note
  where request.id = p_request_id
    and request.campaign_id = request_record.campaign_id
  returning request.* into result_record;

  return pg_catalog.jsonb_build_object(
    'request', pg_catalog.to_jsonb(result_record),
    'draft_entity_id', draft_entity_id
  );
end;
$$;

-- Close PostgreSQL's default PUBLIC execute before transferring ownership.
revoke all on function public.admin_moderate_public_request_v2(
  uuid, uuid, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.admin_moderate_public_request_v2(
  uuid, uuid, timestamptz, text, text
) to authenticated;

comment on function public.admin_moderate_public_request_v2(uuid, uuid, timestamptz, text, text) is
  'MAP-056 authoritative campaign-scoped moderation. Atomically rejects or converts only a request in the supplied campaign; conversion derives the draft campaign from the locked request and creates public-audience draft content. Dedicated NOLOGIN owner remains subject to admin RLS.';

-- PostgreSQL 17 requires SET ROLE capability for ownership transfer. Grant only
-- for the transfer and remove both temporary privileges before commit.
grant atlas_public_request_moderator to current_user;
grant create on schema public to atlas_public_request_moderator;
alter function public.admin_moderate_public_request_v2(uuid, uuid, timestamptz, text, text)
  owner to atlas_public_request_moderator;
revoke create on schema public from atlas_public_request_moderator;
revoke atlas_public_request_moderator from current_user;

-- The old unscoped entrypoint is now an unsafe bypass. Remove every executable
-- grant and then remove the function after v2 no longer depends on it.
revoke all on function public.admin_moderate_public_request(uuid, timestamptz, text, text)
  from public, anon, authenticated;
drop function public.admin_moderate_public_request(uuid, timestamptz, text, text);

commit;
