CREATE TABLE IF NOT EXISTS public.agenda_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  color TEXT DEFAULT 'yellow',
  date_time TIMESTAMP WITH TIME ZONE NOT NULL,
  recurrence_type TEXT DEFAULT 'none',
  recurrence_interval INTEGER DEFAULT 1,
  recurrence_end_date TIMESTAMP WITH TIME ZONE,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.agenda_reminders ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agenda_reminders' AND policyname = 'Users can manage their own agenda reminders'
  ) THEN
    CREATE POLICY "Users can manage their own agenda reminders"
      ON public.agenda_reminders
      FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;
