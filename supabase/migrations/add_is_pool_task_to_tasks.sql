-- Add is_pool_task column to tasks for pool (unassigned) tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_pool_task boolean DEFAULT false;
