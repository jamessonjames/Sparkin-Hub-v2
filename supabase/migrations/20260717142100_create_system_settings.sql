CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow anyone (authenticated and anonymous/portal users) to select settings
DROP POLICY IF EXISTS "allow_select_system_settings" ON public.system_settings;
CREATE POLICY "allow_select_system_settings" ON public.system_settings
  FOR SELECT USING (true);

-- Allow only team members to manage settings
DROP POLICY IF EXISTS "allow_all_team_system_settings" ON public.system_settings;
CREATE POLICY "allow_all_team_system_settings" ON public.system_settings
  FOR ALL TO authenticated USING (public.is_team(auth.uid())) WITH CHECK (public.is_team(auth.uid()));

-- Automatically update updated_at
DROP TRIGGER IF EXISTS touch_system_settings ON public.system_settings;
CREATE TRIGGER touch_system_settings BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
