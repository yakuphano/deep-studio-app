-- Görevler tablosuna dil ve havuz desteği ekleme
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_pool_task BOOLEAN DEFAULT false;
