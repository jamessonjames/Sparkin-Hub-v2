-- Enable Realtime for key tables (allows WebSocket subscriptions from frontend)
-- If a table is already in the publication, you'll get a duplicate error.
-- Run each one separately if needed.
ALTER PUBLICATION supabase_realtime ADD TABLE public.demands;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;

-- Ensure is_team function is executable by authenticated users
GRANT EXECUTE ON FUNCTION public.is_team(uuid) TO authenticated;
