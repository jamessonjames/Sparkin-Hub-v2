-- Secondary cloud storage used whenever Google Drive is temporarily unavailable.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('demand-attachments', 'demand-attachments', true, 52428800)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "team read demand attachments" ON storage.objects;
CREATE POLICY "team read demand attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'demand-attachments' AND public.is_team(auth.uid()));

DROP POLICY IF EXISTS "team upload demand attachments" ON storage.objects;
CREATE POLICY "team upload demand attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'demand-attachments' AND public.is_team(auth.uid()));

DROP POLICY IF EXISTS "team update demand attachments" ON storage.objects;
CREATE POLICY "team update demand attachments"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'demand-attachments' AND public.is_team(auth.uid()))
WITH CHECK (bucket_id = 'demand-attachments' AND public.is_team(auth.uid()));

DROP POLICY IF EXISTS "team delete demand attachments" ON storage.objects;
CREATE POLICY "team delete demand attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'demand-attachments' AND public.is_team(auth.uid()));
