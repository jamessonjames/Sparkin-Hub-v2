-- Helper function to recalculate a client edition's consolidated financial entry
CREATE OR REPLACE FUNCTION public.recalculate_client_edition_financial_entry(p_edition_id UUID)
RETURNS VOID AS $$
DECLARE
  v_price NUMERIC(10,2);
  v_billing_month INT;
  v_billing_year INT;
  v_client_id UUID;
  v_client_name TEXT;
  v_name TEXT;
  v_demands_sum NUMERIC(10,2);
  v_due_date DATE;
  v_entry_exists BOOLEAN;
BEGIN
  -- Get edition details
  SELECT billing_month, billing_year, price, client_id, name
  INTO v_billing_month, v_billing_year, v_price, v_client_id, v_name
  FROM public.client_editions
  WHERE id = p_edition_id;

  -- Only generate financial entry if billing month and year are specified
  IF v_billing_month IS NOT NULL AND v_billing_year IS NOT NULL THEN
    -- Get client name
    SELECT name INTO v_client_name FROM public.clients WHERE id = v_client_id;
    
    -- Construct due date as 10th of that month
    v_due_date := (v_billing_year || '-' || LPAD(v_billing_month::text, 2, '0') || '-10')::date;

    -- If a specific price is set, use it. Otherwise, sum the prices of all demands under this edition.
    IF v_price IS NOT NULL AND v_price > 0 THEN
      v_demands_sum := v_price;
    ELSE
      SELECT COALESCE(SUM(price), 0.00) INTO v_demands_sum FROM public.demands WHERE client_edition_id = p_edition_id;
    END IF;

    -- Check if entry already exists
    SELECT EXISTS(SELECT 1 FROM public.financial_entries WHERE client_edition_id = p_edition_id) INTO v_entry_exists;

    IF v_entry_exists THEN
      UPDATE public.financial_entries
      SET
        title = 'Temporada: ' || v_name || ' — ' || v_client_name,
        client_id = v_client_id,
        total_value = v_demands_sum,
        due_date = v_due_date
      WHERE client_edition_id = p_edition_id AND status != 'paid'; -- Don't overwrite if already paid
    ELSE
      INSERT INTO public.financial_entries (type, title, client_id, client_edition_id, total_value, due_date, status, category)
      VALUES (
        'revenue',
        'Temporada: ' || v_name || ' — ' || v_client_name,
        v_client_id,
        p_edition_id,
        v_demands_sum,
        v_due_date,
        'pending',
        'Projeto Temporada'
      );
    END IF;
  ELSE
    -- Delete entry if billing month/year is removed
    DELETE FROM public.financial_entries WHERE client_edition_id = p_edition_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Update trigger for client_editions table to use the new recalculation helper
CREATE OR REPLACE FUNCTION public.sync_client_edition_to_financial_entry()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.financial_entries WHERE client_edition_id = OLD.id;
    RETURN OLD;
  END IF;

  -- Recalculate
  PERFORM public.recalculate_client_edition_financial_entry(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Update trigger for demands table to support consolidated client edition billing
CREATE OR REPLACE FUNCTION public.sync_demand_to_financial_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_billing_model TEXT;
  v_fixed_type TEXT;
  v_entry_exists BOOLEAN;
  v_edition_billed BOOLEAN;
BEGIN
  -- 1. If deleting a demand
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.financial_entries WHERE demand_id = OLD.id;
    IF OLD.client_edition_id IS NOT NULL THEN
      PERFORM public.recalculate_client_edition_financial_entry(OLD.client_edition_id);
    END IF;
    RETURN OLD;
  END IF;

  -- Get client billing info
  SELECT billing_model, fixed_type 
  INTO v_billing_model, v_fixed_type 
  FROM public.clients 
  WHERE id = NEW.client_id;

  -- Check if this demand's edition has consolidated billing (month/year set)
  v_edition_billed := FALSE;
  IF NEW.client_edition_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.client_editions 
      WHERE id = NEW.client_edition_id 
        AND billing_month IS NOT NULL 
        AND billing_year IS NOT NULL
    ) INTO v_edition_billed;
  END IF;

  -- 2. If demand is under an edition with consolidated billing
  IF v_edition_billed THEN
    -- Delete any individual demand-level financial entry, because it is billed under the edition!
    DELETE FROM public.financial_entries WHERE demand_id = NEW.id;
    
    -- Recalculate the edition's consolidated financial entry
    PERFORM public.recalculate_client_edition_financial_entry(NEW.client_edition_id);
    
    -- If we moved the demand from another edition, recalculate the old edition too
    IF (TG_OP = 'UPDATE') AND OLD.client_edition_id IS NOT NULL AND OLD.client_edition_id != NEW.client_edition_id THEN
      PERFORM public.recalculate_client_edition_financial_entry(OLD.client_edition_id);
    END IF;

  -- 3. Otherwise (normal one-off or seasonal demand with individual billing)
  ELSE
    -- If we moved the demand from a consolidated edition to normal billing, recalculate the old edition
    IF (TG_OP = 'UPDATE') AND OLD.client_edition_id IS NOT NULL AND (NEW.client_edition_id IS NULL OR NOT v_edition_billed) THEN
      PERFORM public.recalculate_client_edition_financial_entry(OLD.client_edition_id);
    END IF;

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
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
