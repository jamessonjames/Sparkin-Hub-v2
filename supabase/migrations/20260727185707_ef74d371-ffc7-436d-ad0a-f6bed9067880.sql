-- Adicionando colunas de preferências ausentes na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS highlight_color TEXT DEFAULT 'roxo',
ADD COLUMN IF NOT EXISTS custom_hex TEXT,
ADD COLUMN IF NOT EXISTS sidebar_order JSONB DEFAULT '[]'::jsonb;

-- Corrigindo GRANTs para garantir acesso
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

-- Adicionando colunas em financial_entries caso não existam
ALTER TABLE public.financial_entries
ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('receita', 'despesa')),
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS demand_id UUID REFERENCES public.demands(id),
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id);

-- Adicionando colunas em agenda_reminders
ALTER TABLE public.agenda_reminders
ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS recurrence_type TEXT,
ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS recurrence_end_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS content TEXT,
ADD COLUMN IF NOT EXISTS color TEXT;
