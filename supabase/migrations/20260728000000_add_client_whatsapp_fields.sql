ALTER TABLE public.clients
  ADD COLUMN whatsapp_phone TEXT,
  ADD COLUMN whatsapp_group_name TEXT,
  ADD COLUMN whatsapp_group_link TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_whatsapp_phone ON public.clients(whatsapp_phone);
CREATE INDEX IF NOT EXISTS idx_clients_whatsapp_group_name ON public.clients(whatsapp_group_name);
