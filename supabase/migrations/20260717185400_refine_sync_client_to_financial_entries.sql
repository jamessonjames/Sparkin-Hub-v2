-- Refine client sync to financial entries trigger to prevent overwriting or zeroing out unpaid invoices when billing model changes
CREATE OR REPLACE FUNCTION public.sync_client_monthly_value_to_financial_entries()
RETURNS TRIGGER AS $$
BEGIN
  -- If name changes, update titles of unpaid 'Mensalidade' entries
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE public.financial_entries
    SET
      title = 'Mensalidade — ' || NEW.name || ' (' || 
              CASE 
                WHEN title LIKE '%(%' THEN SUBSTRING(title FROM '\(([^)]+)\)') 
                ELSE TO_CHAR(due_date, 'MM/YYYY') 
              END || ')'
    WHERE 
      client_id = NEW.id 
      AND category = 'Mensalidade' 
      AND demand_id IS NULL
      AND status != 'paid';
  END IF;

  -- If monthly_value changes, update values of unpaid 'Mensalidade' entries,
  -- but ONLY if the client is still under fixed/credits and the new value is not null.
  IF OLD.monthly_value IS DISTINCT FROM NEW.monthly_value THEN
    IF ((NEW.billing_model = 'fixed' AND NEW.fixed_type = 'monthly') OR (NEW.billing_model = 'credits')) AND NEW.monthly_value IS NOT NULL THEN
      UPDATE public.financial_entries
      SET
        total_value = NEW.monthly_value
      WHERE 
        client_id = NEW.id 
        AND category = 'Mensalidade' 
        AND demand_id IS NULL
        AND status != 'paid';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
