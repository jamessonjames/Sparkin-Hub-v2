ALTER FUNCTION public.is_team(uuid) SECURITY INVOKER;
ALTER FUNCTION public.has_role(uuid, public.app_role) SECURITY INVOKER;