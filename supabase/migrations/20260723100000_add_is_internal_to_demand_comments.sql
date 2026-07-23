-- Add is_internal flag to demand_comments table to support private internal team comments
ALTER TABLE demand_comments ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false;
