CREATE TABLE IF NOT EXISTS public.crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'novo'
    CHECK (status IN ('novo', 'contato', 'proposta', 'ganho', 'perdido')),
  estimated_value NUMERIC(10,2) DEFAULT 0.00,
  billing_model TEXT DEFAULT 'Pagamento Mensal Fixo',
  internal_notes TEXT,
  client_color TEXT DEFAULT '#3b82f6',
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_crm_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_crm_leads_updated_at'
  ) THEN
    CREATE TRIGGER set_crm_leads_updated_at
      BEFORE UPDATE ON public.crm_leads
      FOR EACH ROW
      EXECUTE FUNCTION update_crm_leads_updated_at();
  END IF;
END;
$$;

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins can manage CRM leads"
  ON public.crm_leads
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );
