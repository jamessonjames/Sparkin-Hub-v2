CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 15 AND 1440),
  notes TEXT NOT NULL DEFAULT '',
  transcript TEXT NOT NULL DEFAULT '',
  ai_summary TEXT NOT NULL DEFAULT '',
  audio_url TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetings_starts_at ON public.meetings(starts_at);
CREATE INDEX IF NOT EXISTS idx_meetings_client_id ON public.meetings(client_id);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
GRANT ALL ON public.meetings TO service_role;

DROP POLICY IF EXISTS "Authenticated users can manage meetings" ON public.meetings;
CREATE POLICY "Authenticated users can manage meetings" ON public.meetings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS touch_meetings ON public.meetings;
CREATE TRIGGER touch_meetings BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Move meetings created by the previous implementation out of the demands table.
DO $$
DECLARE
  item RECORD;
  payload JSONB;
BEGIN
  FOR item IN
    SELECT id, client_id, title, due_date, estimated_hours, internal_notes,
           created_at, updated_at, created_by_user_id
    FROM public.demands
    WHERE deleted_at IS NULL
      AND internal_notes LIKE '%"is_meeting":true%'
  LOOP
    BEGIN
      payload := item.internal_notes::jsonb;
      IF payload->>'is_meeting' = 'true' THEN
        INSERT INTO public.meetings (
          id, client_id, title, starts_at, duration_minutes, notes,
          transcript, ai_summary, audio_url, created_by_user_id, created_at, updated_at
        ) VALUES (
          item.id, item.client_id, item.title, item.due_date,
          GREATEST(15, ROUND(COALESCE(item.estimated_hours, 1) * 60)::INTEGER),
          COALESCE(payload->>'notes', ''), COALESCE(payload->>'transcript', ''),
          COALESCE(payload->>'ai_summary', ''), payload->>'audio_url',
          item.created_by_user_id, item.created_at, item.updated_at
        ) ON CONFLICT (id) DO NOTHING;

        UPDATE public.demands SET deleted_at = NOW() WHERE id = item.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not migrate legacy meeting %: %', item.id, SQLERRM;
    END;
  END LOOP;
END $$;
