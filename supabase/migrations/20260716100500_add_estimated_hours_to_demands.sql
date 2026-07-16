-- Add estimated_hours to demands table supporting 30-minute increments (e.g. 0.5, 1.0, 1.5)
ALTER TABLE demands ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC DEFAULT 1.0;
