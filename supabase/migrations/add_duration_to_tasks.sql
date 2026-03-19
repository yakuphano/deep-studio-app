-- Add duration column (seconds) to tasks for audio length
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration numeric;
