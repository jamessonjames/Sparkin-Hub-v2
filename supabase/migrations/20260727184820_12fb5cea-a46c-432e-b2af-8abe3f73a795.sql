CREATE TABLE IF NOT EXISTS public.agenda_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    color TEXT DEFAULT 'yellow',
    date_time TIMESTAMPTZ NOT NULL,
    recurrence_type TEXT DEFAULT 'none' CHECK (recurrence_type IN ('none', 'daily', 'weekly', 'monthly', 'yearly')),
    recurrence_interval INTEGER DEFAULT 1,
    recurrence_end_date TIMESTAMPTZ,
    is_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_reminders TO authenticated;
GRANT ALL ON public.agenda_reminders TO service_role;
ALTER TABLE public.agenda_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own reminders" ON public.agenda_reminders
    FOR ALL TO authenticated USING (auth.uid() = user_id);
