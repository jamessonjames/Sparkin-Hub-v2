-- Performance indexes to reduce Disk IO usage
-- All use IF NOT EXISTS so they're safe to re-run

CREATE INDEX IF NOT EXISTS idx_demands_status ON public.demands(status);
CREATE INDEX IF NOT EXISTS idx_demands_assignee_user_id ON public.demands(assignee_user_id);
CREATE INDEX IF NOT EXISTS idx_demands_client_id ON public.demands(client_id);
CREATE INDEX IF NOT EXISTS idx_demands_due_date ON public.demands(due_date);
CREATE INDEX IF NOT EXISTS idx_demands_deleted_at ON public.demands(deleted_at);
CREATE INDEX IF NOT EXISTS idx_demands_sort_order ON public.demands(sort_order);

CREATE INDEX IF NOT EXISTS idx_financial_entries_due_date ON public.financial_entries(due_date);
CREATE INDEX IF NOT EXISTS idx_financial_entries_client_id ON public.financial_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_status ON public.financial_entries(status);

CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON public.agenda_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_date_time ON public.agenda_reminders(date_time);
