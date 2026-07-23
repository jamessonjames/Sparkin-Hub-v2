ALTER TABLE public.client_gems ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'designer';
