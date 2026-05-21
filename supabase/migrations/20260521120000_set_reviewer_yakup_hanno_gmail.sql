-- QA reviewer: yakup.hanno@gmail.com
-- Supabase Dashboard > SQL Editor'dan da tek başına çalıştırılabilir.

UPDATE public.profiles AS p
SET
  role = 'reviewer',
  is_admin = false
FROM auth.users AS u
WHERE p.id = u.id
  AND lower(u.email) = lower('yakup.hanno@gmail.com');
