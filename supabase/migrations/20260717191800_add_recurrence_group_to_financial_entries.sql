-- Add recurrence_group_id column to group recurring/parceled expenses
ALTER TABLE public.financial_entries
ADD COLUMN IF NOT EXISTS recurrence_group_id UUID;
