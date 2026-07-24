-- Create demand_suggestions table
CREATE TABLE IF NOT EXISTS public.demand_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'whatsapp', -- 'whatsapp', 'meeting', 'email'
  suggested_type TEXT NOT NULL DEFAULT 'NOVA_DEMANDA', -- 'NOVA_DEMANDA', 'AJUSTE_DEMANDA'
  target_demand_id UUID REFERENCES public.demands(id) ON DELETE SET NULL,
  suggested_title TEXT NOT NULL,
  suggested_description TEXT,
  ai_summary TEXT,
  raw_content TEXT,
  audio_url TEXT,
  estimated_hours NUMERIC(4, 2) DEFAULT 1.0,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'dismissed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by status and client_id
CREATE INDEX IF NOT EXISTS idx_demand_suggestions_status ON public.demand_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_demand_suggestions_client_id ON public.demand_suggestions(client_id);

-- Create capture_settings table for storing Chrome Extension scanning preferences
CREATE TABLE IF NOT EXISTS public.capture_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL DEFAULT 'global',
  scan_frequency TEXT NOT NULL DEFAULT '1h', -- 'manual', '30m', '1h', '3h', 'daily'
  max_messages INTEGER NOT NULL DEFAULT 30,
  ai_provider TEXT NOT NULL DEFAULT 'gemini', -- 'gemini', 'deepseek', 'ollama'
  api_key TEXT,
  ollama_url TEXT,
  enabled_clients JSONB DEFAULT '[]'::jsonb,
  last_scan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.demand_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_settings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "Allow authenticated read/write on demand_suggestions" ON public.demand_suggestions
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated read/write on capture_settings" ON public.capture_settings
  FOR ALL USING (auth.role() = 'authenticated');

-- Allow anon read/write if using anon key for local API
CREATE POLICY "Allow anon read/write on demand_suggestions" ON public.demand_suggestions
  FOR ALL USING (true);

CREATE POLICY "Allow anon read/write on capture_settings" ON public.capture_settings
  FOR ALL USING (true);
