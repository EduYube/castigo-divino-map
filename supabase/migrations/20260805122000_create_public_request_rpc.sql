-- MAP-014: closed public request operation.

create function public.submit_public_request(
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
volatile
security definer
set search_path = ''
as $$
declare
  sender_name_value text := btrim(p_sender_name);
  proposed_name_value text := btrim(p_proposed_name);
  description_value text := btrim(p_description);
  reason_value text := btrim(p_reason);
begin
  if nullif(btrim(p_honeypot), '') is not null then
    return true;
  end if;

  if char_length(sender_name_value) not between 1 and 80
     or char_length(proposed_name_value) not between 1 and 160
     or char_length(description_value) not between 1 and 2000
     or char_length(reason_value) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid public request';
  end if;

  if p_x not between 0 and 3600
     or p_x in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
     or p_y not between 0 and 2329
     or p_y in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision) then
    raise exception using errcode = '22023', message = 'invalid public request';
  end if;

  insert into public.public_requests (
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
  )
  values (
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

revoke all on function public.submit_public_request(
  text,
  text,
  public.entity_type,
  double precision,
  double precision,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.submit_public_request(
  text,
  text,
  public.entity_type,
  double precision,
  double precision,
  text,
  text,
  text
) to anon, authenticated;
