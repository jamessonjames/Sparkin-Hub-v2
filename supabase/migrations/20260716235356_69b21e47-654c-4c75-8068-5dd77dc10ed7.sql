ALTER TABLE public.demands
  ALTER COLUMN due_date TYPE TIMESTAMPTZ
  USING CASE
    WHEN due_date IS NULL THEN NULL
    ELSE (due_date::date + TIME '09:00') AT TIME ZONE 'America/Sao_Paulo'
  END;