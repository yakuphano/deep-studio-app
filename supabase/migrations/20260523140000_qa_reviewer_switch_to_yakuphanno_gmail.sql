-- Eski QA reviewer (yakup.hanno@gmail.com) kaldırılır; reviewer rolü yakuphanno@gmail.com hesabına verilir.
-- Daha önce 20260521120000 migration'ı uygulanmış veritabanları için.

UPDATE public.profiles AS p
SET
  role = 'annotator',
  is_admin = false
FROM auth.users AS u
WHERE p.id = u.id
  AND lower(u.email) = lower('yakup.hanno@gmail.com');

UPDATE public.profiles AS p
SET
  role = 'reviewer',
  is_admin = false
FROM auth.users AS u
WHERE p.id = u.id
  AND lower(u.email) = lower('yakuphanno@gmail.com');
