ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS assignee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.meetings
SET assignee_user_id = created_by_user_id
WHERE assignee_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_assignee_user_id
  ON public.meetings(assignee_user_id);
