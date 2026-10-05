-- Migration: Add deleted_at to meetings for soft-delete / trash support
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_meetings_deleted_at ON public.meetings(deleted_at);
