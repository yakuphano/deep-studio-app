-- Add type column to tasks for 'audio' | 'image'
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS type text;
COMMENT ON COLUMN tasks.type IS 'Task type: audio or image';
