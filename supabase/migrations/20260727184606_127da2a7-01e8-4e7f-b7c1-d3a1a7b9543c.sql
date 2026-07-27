-- Adicionando colunas faltantes para suportar a lógica de negócios e UI
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.clients(id);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS is_project BOOLEAN DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS color TEXT;

-- Adicionando suporte para edições de clientes e tokens de portal
CREATE TABLE IF NOT EXISTS public.client_editions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT false,
    billing_month INTEGER,
    billing_year INTEGER,
    price DECIMAL(12,2),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_editions TO authenticated;
GRANT ALL ON public.client_editions TO service_role;
ALTER TABLE public.client_editions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.client_gems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    gem_url TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('designer', 'copywriter')),
    created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_gems TO authenticated;
GRANT ALL ON public.client_gems TO service_role;
ALTER TABLE public.client_gems ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.file_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_attachments TO authenticated;
GRANT ALL ON public.file_attachments TO service_role;
ALTER TABLE public.file_attachments ENABLE ROW LEVEL SECURITY;

-- Adicionando suporte a enums estendidos
DO $$ 
BEGIN 
    ALTER TYPE public.billing_model ADD VALUE IF NOT EXISTS 'seasonal';
EXCEPTION 
    WHEN duplicate_object THEN null; 
END $$;
