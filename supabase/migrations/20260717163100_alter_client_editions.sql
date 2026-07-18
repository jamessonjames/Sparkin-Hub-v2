-- Alter client_editions table to add billing columns
ALTER TABLE public.client_editions 
  ADD COLUMN IF NOT EXISTS billing_month INTEGER CHECK (billing_month >= 1 AND billing_month <= 12),
  ADD COLUMN IF NOT EXISTS billing_year INTEGER,
  ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);

-- Alter financial_entries table to add client_edition_id relation
ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS client_edition_id UUID REFERENCES public.client_editions(id) ON DELETE CASCADE UNIQUE;

-- Trigger to automatically sync client_editions to financial_entries
CREATE OR REPLACE FUNCTION public.sync_client_edition_to_financial_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_client_name TEXT;
  v_entry_exists BOOLEAN;
  v_due_date DATE;
BEGIN
  -- If deleting, clean up the financial entry
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.financial_entries WHERE client_edition_id = OLD.id;
    RETURN OLD;
  END IF;

  -- If billing month, year, and price are set
  IF NEW.billing_month IS NOT NULL AND NEW.billing_year IS NOT NULL AND NEW.price IS NOT NULL AND NEW.price > 0 THEN
    -- Get client name
    SELECT name INTO v_client_name FROM public.clients WHERE id = NEW.client_id;
    
    -- Construct due date as 10th of that month
    v_due_date := (NEW.billing_year || '-' || LPAD(NEW.billing_month::text, 2, '0') || '-10')::date;

    -- Check if entry already exists
    SELECT EXISTS(SELECT 1 FROM public.financial_entries WHERE client_edition_id = NEW.id) INTO v_entry_exists;

    IF v_entry_exists THEN
      UPDATE public.financial_entries
      SET
        title = 'Temporada: ' || NEW.name || ' — ' || v_client_name,
        client_id = NEW.client_id,
        total_value = NEW.price,
        due_date = v_due_date
      WHERE client_edition_id = NEW.id AND status != 'paid'; -- Don't overwrite if already paid
    ELSE
      INSERT INTO public.financial_entries (type, title, client_id, client_edition_id, total_value, due_date, status, category)
      VALUES (
        'revenue',
        'Temporada: ' || NEW.name || ' — ' || v_client_name,
        NEW.client_id,
        NEW.id,
        NEW.price,
        v_due_date,
        'pending',
        'Projeto Temporada'
      );
    END IF;
  ELSE
    -- Delete entry if it exists (e.g. price or billing month was removed)
    DELETE FROM public.financial_entries WHERE client_edition_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER sync_client_edition_to_financial_entry_trg
AFTER INSERT OR UPDATE OR DELETE ON public.client_editions
FOR EACH ROW EXECUTE FUNCTION public.sync_client_edition_to_financial_entry();
