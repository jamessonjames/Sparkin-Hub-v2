-- Adicionando colunas faltantes em tabelas existentes
ALTER TABLE public.demand_comments ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false;

-- Criando a tabela de CRM que está faltando
CREATE TABLE IF NOT EXISTS public.crm_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'contato', 'proposta', 'ganho', 'perdido')),
    estimated_value DECIMAL(12,2),
    billing_model TEXT,
    internal_notes TEXT,
    client_color TEXT DEFAULT '#3b82f6',
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_leads TO authenticated;
GRANT ALL ON public.crm_leads TO service_role;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para as novas tabelas (simplificadas para authenticated)
CREATE POLICY "Users can manage all CRM leads" ON public.crm_leads
    FOR ALL TO authenticated USING (true);

CREATE POLICY "Users can manage all client editions" ON public.client_editions
    FOR ALL TO authenticated USING (true);

CREATE POLICY "Users can manage all client gems" ON public.client_gems
    FOR ALL TO authenticated USING (true);

CREATE POLICY "Users can manage all file attachments" ON public.file_attachments
    FOR ALL TO authenticated USING (true);
