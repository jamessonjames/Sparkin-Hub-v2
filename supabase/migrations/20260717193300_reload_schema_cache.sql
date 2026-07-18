-- Force PostgREST schema cache reload so the new column recurrence_group_id is recognized immediately.
NOTIFY pgrst, 'reload schema';
