-- MAP-017 follow-up hardening: keep privilege elevation in the private helper only.

alter function public.current_user_is_admin() security invoker;
revoke execute on function public.current_user_is_admin() from anon;
grant execute on function public.current_user_is_admin() to authenticated;

comment on function public.current_user_is_admin() is
  'Returns whether the authenticated auth.uid() is allowlisted for administration without exposing private.admin_users.';
