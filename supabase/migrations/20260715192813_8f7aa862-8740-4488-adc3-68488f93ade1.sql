
-- Allow anonymous read access to clients and their demands for public portal
CREATE POLICY "Anon can read clients for public portal"
ON public.clients FOR SELECT
TO anon
USING (deleted_at IS NULL AND access_active = true);

CREATE POLICY "Anon can read demands for public portal"
ON public.demands FOR SELECT
TO anon
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = demands.client_id
      AND c.deleted_at IS NULL
      AND c.access_active = true
  )
);

GRANT SELECT ON public.clients TO anon;
GRANT SELECT ON public.demands TO anon;
