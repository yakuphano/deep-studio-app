ALTER TABLE tasks ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS annotation_data jsonb;
