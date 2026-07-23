CREATE TABLE IF NOT EXISTS public.client_gems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    gem_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_gems ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
DROP POLICY IF EXISTS "authenticated_all_client_gems" ON public.client_gems;
CREATE POLICY "authenticated_all_client_gems" ON public.client_gems
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
