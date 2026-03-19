-- profiles tablosuna role, is_admin ve is_active sütunlarını ekle (yoksa)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Mevcut admin kullanıcılar için: email ile eşleşen kullanıcıya admin ver
-- Gerekirse aşağıdaki satırı kendi admin email'inizle güncelleyip çalıştırın:
-- UPDATE profiles SET role = 'admin', is_admin = true WHERE id IN (SELECT id FROM auth.users WHERE email = 'admin@example.com');
