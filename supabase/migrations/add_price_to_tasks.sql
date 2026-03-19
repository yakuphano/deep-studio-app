-- Add price column to tasks if not exists
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS price numeric DEFAULT 0;
