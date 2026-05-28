-- Kaliteci hesabı: yakuphanno@gmail.com (giriş + QA erişimi)
UPDATE public.profiles AS p
SET
  role = 'quality_controller',
  is_admin = false,
  is_blocked = false,
  is_active = true
FROM auth.users AS u
WHERE p.id = u.id
  AND lower(trim(u.email)) = lower('yakuphanno@gmail.com');
