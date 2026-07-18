-- Create financial_entries table
CREATE TABLE IF NOT EXISTS public.financial_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('revenue', 'expense')),
  title TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  demand_id UUID REFERENCES public.demands(id) ON DELETE CASCADE UNIQUE,
  due_date DATE NOT NULL,
  total_value NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  paid_value NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  category TEXT,
  recipient_provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;

-- Create policy for team members
CREATE POLICY "allow_team_manage_financial_entries" ON public.financial_entries
  FOR ALL TO authenticated USING (public.is_team(auth.uid())) WITH CHECK (public.is_team(auth.uid()));

-- Trigger to update updated_at
CREATE TRIGGER touch_financial_entries BEFORE UPDATE ON public.financial_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Trigger to automatically sync one_off and seasonal demands to financial_entries
CREATE OR REPLACE FUNCTION public.sync_demand_to_financial_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_billing_model TEXT;
  v_fixed_type TEXT;
  v_entry_exists BOOLEAN;
BEGIN
  -- If deleting, clean up the financial entry
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.financial_entries WHERE demand_id = OLD.id;
    RETURN OLD;
  END IF;

  -- Get client billing info
  SELECT billing_model, fixed_type 
  INTO v_billing_model, v_fixed_type 
  FROM public.clients 
  WHERE id = NEW.client_id;

  -- If client is seasonal or one-off and demand has a price
  IF (v_billing_model = 'seasonal' OR (v_billing_model = 'fixed' AND v_fixed_type = 'one_off')) AND NEW.price IS NOT NULL AND NEW.price > 0 THEN
    -- Check if entry already exists
    SELECT EXISTS(SELECT 1 FROM public.financial_entries WHERE demand_id = NEW.id) INTO v_entry_exists;

    IF v_entry_exists THEN
      UPDATE public.financial_entries
      SET
        title = NEW.title,
        client_id = NEW.client_id,
        total_value = NEW.price,
        due_date = COALESCE(NEW.due_date, NEW.created_at::date)
      WHERE demand_id = NEW.id AND status != 'paid'; -- Don't overwrite if already paid
    ELSE
      INSERT INTO public.financial_entries (type, title, client_id, demand_id, total_value, due_date, status)
      VALUES (
        'revenue',
        NEW.title,
        NEW.client_id,
        NEW.id,
        NEW.price,
        COALESCE(NEW.due_date, NEW.created_at::date),
        'pending'
      );
    END IF;
  ELSE
    -- Delete entry if it exists (e.g. price was removed or client billing model changed)
    DELETE FROM public.financial_entries WHERE demand_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER sync_demand_to_financial_entry_trg
AFTER INSERT OR UPDATE OR DELETE ON public.demands
FOR EACH ROW EXECUTE FUNCTION public.sync_demand_to_financial_entry();
