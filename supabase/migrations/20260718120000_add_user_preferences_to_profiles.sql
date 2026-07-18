-- Add per-user theme and highlight color columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'dark';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS highlight_color TEXT DEFAULT 'roxo';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_hex TEXT DEFAULT '#4f46e5';
