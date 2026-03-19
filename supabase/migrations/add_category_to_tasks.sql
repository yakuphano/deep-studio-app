-- Add category column to tasks if not exists
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category text DEFAULT 'transcription';
