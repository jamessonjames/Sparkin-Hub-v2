UPDATE public.demands
SET due_date = (due_date::date + TIME '09:00') AT TIME ZONE 'America/Sao_Paulo'
WHERE due_date IS NOT NULL
  AND due_date::time = TIME '00:00';