CREATE TABLE IF NOT EXISTS public.file_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('client', 'demand')),
  entity_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size INTEGER NOT NULL DEFAULT 0,
  drive_file_id TEXT NOT NULL,
  drive_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_file_attachments_entity ON public.file_attachments(entity_type, entity_id) WHERE deleted_at IS NULL;

ALTER TABLE public.file_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_team_manage_attachments" ON public.file_attachments
  FOR ALL TO authenticated USING (public.is_team(auth.uid())) WITH CHECK (public.is_team(auth.uid()));
