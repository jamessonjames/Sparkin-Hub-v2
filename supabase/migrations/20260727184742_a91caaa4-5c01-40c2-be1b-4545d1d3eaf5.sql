-- Adicionando colunas faltantes em file_attachments
ALTER TABLE public.file_attachments ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE public.file_attachments ADD COLUMN IF NOT EXISTS drive_file_id TEXT;
ALTER TABLE public.file_attachments ADD COLUMN IF NOT EXISTS drive_url TEXT;
ALTER TABLE public.file_attachments ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES auth.users(id);
ALTER TABLE public.file_attachments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Adicionando colunas faltantes em financial_entries
ALTER TABLE public.financial_entries ADD COLUMN IF NOT EXISTS recurrence_group_id UUID;

-- Criando a tabela de configurações do sistema que está faltando
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage system settings" ON public.system_settings
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Everyone can read public settings" ON public.system_settings
    FOR SELECT TO authenticated USING (true);
