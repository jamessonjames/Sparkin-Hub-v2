-- Criando a tabela de sugestões de demandas
CREATE TABLE IF NOT EXISTS public.demand_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('whatsapp', 'meeting', 'email')),
    suggested_type TEXT NOT NULL CHECK (suggested_type IN ('NOVA_DEMANDA', 'AJUSTE_DEMANDA')),
    target_demand_id UUID REFERENCES public.demands(id),
    suggested_title TEXT NOT NULL,
    suggested_description TEXT,
    ai_summary TEXT,
    raw_content TEXT,
    audio_url TEXT,
    estimated_hours DECIMAL(12,2) DEFAULT 1.0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.demand_suggestions TO authenticated;
GRANT ALL ON public.demand_suggestions TO service_role;
ALTER TABLE public.demand_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage all demand suggestions" ON public.demand_suggestions
    FOR ALL TO authenticated USING (true);

-- Criando a tabela de configurações de captura
CREATE TABLE IF NOT EXISTS public.capture_settings (
    key TEXT PRIMARY KEY,
    scan_frequency TEXT DEFAULT '1h',
    max_messages INTEGER DEFAULT 30,
    ai_provider TEXT DEFAULT 'gemini',
    api_key TEXT,
    ollama_url TEXT,
    enabled_clients JSONB DEFAULT '[]'::jsonb,
    last_scan_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.capture_settings TO authenticated;
GRANT ALL ON public.capture_settings TO service_role;
ALTER TABLE public.capture_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage capture settings" ON public.capture_settings
    FOR ALL TO authenticated USING (true);
