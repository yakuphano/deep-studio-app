-- Auth'ta kayıtlı ama profiles'ta satırı olmayan kullanıcıları oluştur (admin hesap listesi).
-- yakuphanno@gmail.com: kaliteci rolü + e-posta senkronu.

CREATE OR REPLACE FUNCTION public.admin_sync_missing_profiles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer;
BEGIN
  IF NOT public.profile_is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  WITH ins AS (
    INSERT INTO public.profiles (id, email, username, role, is_admin, is_blocked, languages)
    SELECT
      u.id,
      lower(trim(u.email)),
      coalesce(
        nullif(trim(u.raw_user_meta_data->>'username'), ''),
        split_part(lower(trim(u.email)), '@', 1)
      ),
      'annotator',
      false,
      false,
      ARRAY['tr', 'en']::text[]
    FROM auth.users u
    WHERE u.email IS NOT NULL
      AND trim(u.email) <> ''
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
    ON CONFLICT (id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO inserted_count FROM ins;

  -- E-posta profiles'ta boşsa auth'tan doldur
  UPDATE public.profiles AS p
  SET email = lower(trim(u.email))
  FROM auth.users AS u
  WHERE p.id = u.id
    AND (p.email IS NULL OR trim(p.email) = '');

  -- Bilinen kaliteci hesabı
  UPDATE public.profiles AS p
  SET
    role = 'reviewer',
    is_admin = false,
    is_blocked = false,
    email = lower(trim(u.email))
  FROM auth.users AS u
  WHERE p.id = u.id
    AND lower(trim(u.email)) = lower('yakuphanno@gmail.com');

  RETURN coalesce(inserted_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_sync_missing_profiles() TO authenticated;

COMMENT ON FUNCTION public.admin_sync_missing_profiles() IS
  'Admin: auth.users içinde olup profiles''ta olmayan hesapları ekler; yakuphanno@gmail.com kaliteci yapılır.';
