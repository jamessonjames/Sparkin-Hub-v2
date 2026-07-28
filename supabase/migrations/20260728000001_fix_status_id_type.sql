-- Fix status_id column type: original migration created it as UUID,
-- but custom statuses (e.g. "custom_rascunho_0015") are text identifiers.
-- ALTER COLUMN ... TYPE TEXT converts the column safely.
ALTER TABLE public.demands ALTER COLUMN status_id TYPE TEXT USING status_id::text;
