-- Alter due_date column from DATE to TIMESTAMPTZ to store both date and time components
ALTER TABLE public.demands ALTER COLUMN due_date TYPE TIMESTAMPTZ USING due_date::TIMESTAMPTZ;
