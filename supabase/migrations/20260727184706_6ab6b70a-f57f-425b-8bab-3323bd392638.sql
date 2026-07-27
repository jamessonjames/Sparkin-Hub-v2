-- Adicionando colunas faltantes em tabelas existentes
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS status_id TEXT;
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS client_edition_id UUID REFERENCES public.client_editions(id);
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS price DECIMAL(12,2);
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS assignee_user_id UUID;

-- Criando a tabela de transações financeiras
CREATE TABLE IF NOT EXISTS public.financial_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('revenue', 'expense')),
    title TEXT NOT NULL,
    client_id UUID REFERENCES public.clients(id),
    demand_id UUID REFERENCES public.demands(id),
    due_date DATE NOT NULL,
    total_value DECIMAL(12,2) NOT NULL,
    paid_value DECIMAL(12,2) DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
    category TEXT,
    recipient_provider TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_entries TO authenticated;
GRANT ALL ON public.financial_entries TO service_role;
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage all financial entries" ON public.financial_entries
    FOR ALL TO authenticated USING (true);
