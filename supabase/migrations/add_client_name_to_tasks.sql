-- Add client_name column to tasks for firm/customer tracking
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS client_name TEXT;
