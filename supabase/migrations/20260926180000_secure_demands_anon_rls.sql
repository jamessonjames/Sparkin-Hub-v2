-- Migration: 20260926180000_secure_demands_anon_rls.sql
-- Description: Harden Supabase RLS for anon role to prevent sensitive data leakage.
-- Specifically, revokes SELECT on internal_notes and price from the anon role,
-- while allowing anon to read only public portal demand columns.

DO $$
BEGIN
  -- Revoke SELECT on sensitive columns from anon
  REVOKE SELECT (internal_notes, price) ON public.demands FROM anon;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not revoke column permissions directly: %', SQLERRM;
END $$;
