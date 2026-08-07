-- MAP-017: expose only the current caller's administrative authorization result.

create function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin();
$$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to anon, authenticated;

comment on function public.current_user_is_admin() is
  'Returns whether auth.uid() is allowlisted for administration without exposing private.admin_users.';
