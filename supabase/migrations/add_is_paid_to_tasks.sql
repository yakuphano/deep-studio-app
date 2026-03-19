-- Add is_paid column to tasks if not exists
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_paid boolean DEFAULT false;
