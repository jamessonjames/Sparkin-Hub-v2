-- Trigger function to synchronize client monthly value updates to unpaid financial entries
CREATE OR REPLACE FUNCTION public.sync_client_monthly_value_to_financial_entries()
RETURNS TRIGGER AS $$
BEGIN
  -- If monthly_value or name changes, update all unpaid 'Mensalidade' entries for this client
  IF (OLD.monthly_value IS DISTINCT FROM NEW.monthly_value) OR (OLD.name IS DISTINCT FROM NEW.name) THEN
    UPDATE public.financial_entries
    SET
      total_value = COALESCE(NEW.monthly_value, 0.00),
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER sync_client_monthly_value_to_financial_entries_trg
AFTER UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.sync_client_monthly_value_to_financial_entries();
