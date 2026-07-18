-- Update trigger function to delete financial entries when a demand is soft-deleted
CREATE OR REPLACE FUNCTION public.sync_demand_to_financial_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_billing_model TEXT;
  v_fixed_type TEXT;
  v_entry_exists BOOLEAN;
  v_edition_billed BOOLEAN;
BEGIN
  -- 1. If deleting a demand (hard delete)
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.financial_entries WHERE demand_id = OLD.id;
    IF OLD.client_edition_id IS NOT NULL THEN
      PERFORM public.recalculate_client_edition_financial_entry(OLD.client_edition_id);
    END IF;
    RETURN OLD;
  END IF;

  -- 1.5. If soft-deleting a demand (update where deleted_at is set)
  IF (TG_OP = 'UPDATE') AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    DELETE FROM public.financial_entries WHERE demand_id = NEW.id;
    IF NEW.client_edition_id IS NOT NULL THEN
      PERFORM public.recalculate_client_edition_financial_entry(NEW.client_edition_id);
    END IF;
    RETURN NEW;
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

    IF (v_billing_model = 'seasonal' OR (v_billing_model = 'fixed' AND v_fixed_type = 'one_off')) AND NEW.price IS NOT NULL AND NEW.price > 0 AND NEW.deleted_at IS NULL THEN
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
      -- Delete entry if it exists (e.g. price was removed or client billing model changed or demand is soft-deleted)
      DELETE FROM public.financial_entries WHERE demand_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
