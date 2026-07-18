-- Add foreign key constraint from public.demands (assignee_user_id) to public.profiles (id)
-- This allows PostgREST to automatically resolve the relation between demands and profiles.
ALTER TABLE public.demands
DROP CONSTRAINT IF EXISTS fk_demands_assignee_profile,
ADD CONSTRAINT fk_demands_assignee_profile
FOREIGN KEY (assignee_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
