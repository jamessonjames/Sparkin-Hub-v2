-- Fix search_path (touch_updated_at faltava SET search_path)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Revogar execução das SECURITY DEFINER (chamadas ficam só via triggers/policies internas)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_team(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- client_sessions: RLS ativa sem policies bloqueia authenticated. Adiciona policy explícita "nada" para clareza.
CREATE POLICY "no direct access" ON public.client_sessions FOR ALL TO authenticated USING (false) WITH CHECK (false);