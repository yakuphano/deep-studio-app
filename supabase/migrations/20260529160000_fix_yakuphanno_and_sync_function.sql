-- SQL Editor + uygulama: yakuphanno@gmail.com kaliteci profili

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'annotator';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false;

CREATE OR REPLACE FUNCTION public.admin_sync_missing_profiles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer;
  v_langs_type text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.profile_is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT c.data_type INTO v_langs_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'profiles'
    AND c.column_name = 'languages';

  IF v_langs_type = 'jsonb' THEN
    WITH ins AS (
      INSERT INTO public.profiles (id, email, username, role, is_admin, is_blocked, languages)
      SELECT
        u.id,
        lower(trim(u.email)),
        coalesce(nullif(trim(u.raw_user_meta_data->>'username'), ''), split_part(lower(trim(u.email)), '@', 1)),
        'annotator',
        false,
        false,
        '["tr","en"]'::jsonb
      FROM auth.users u
      WHERE u.email IS NOT NULL AND trim(u.email) <> ''
        AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
      ON CONFLICT (id) DO NOTHING
      RETURNING 1
    )
    SELECT count(*)::integer INTO inserted_count FROM ins;
  ELSE
    WITH ins AS (
      INSERT INTO public.profiles (id, email, username, role, is_admin, is_blocked, languages)
      SELECT
        u.id,
        lower(trim(u.email)),
        coalesce(nullif(trim(u.raw_user_meta_data->>'username'), ''), split_part(lower(trim(u.email)), '@', 1)),
        'annotator',
        false,
        false,
        ARRAY['tr', 'en']::text[]
      FROM auth.users u
      WHERE u.email IS NOT NULL AND trim(u.email) <> ''
        AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
      ON CONFLICT (id) DO NOTHING
      RETURNING 1
    )
    SELECT count(*)::integer INTO inserted_count FROM ins;
  END IF;

  UPDATE public.profiles AS p
  SET email = lower(trim(u.email))
  FROM auth.users AS u
  WHERE p.id = u.id
    AND (p.email IS NULL OR trim(coalesce(p.email, '')) = '');

  UPDATE public.profiles AS p
  SET role = 'reviewer', is_admin = false, email = lower(trim(u.email)), is_blocked = false
  FROM auth.users AS u
  WHERE p.id = u.id
    AND lower(trim(u.email)) = lower('yakuphanno@gmail.com');

  RETURN coalesce(inserted_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_sync_missing_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sync_missing_profiles() TO service_role;

-- Tek seferlik düzeltme (SQL Editor'da çalıştırın)
DO $$
DECLARE
  v_user_id uuid;
  v_email text := 'yakuphanno@gmail.com';
  v_langs_type text;
BEGIN
  SELECT u.id INTO v_user_id
  FROM auth.users u
  WHERE lower(trim(u.email)) = lower(v_email)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth.users içinde % yok. Önce bu e-posta ile kullanıcı oluşturun.', v_email;
  END IF;

  SELECT c.data_type INTO v_langs_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'profiles'
    AND c.column_name = 'languages';

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user_id) THEN
    IF v_langs_type = 'jsonb' THEN
      INSERT INTO public.profiles (id, email, username, role, is_admin, is_blocked, languages)
      VALUES (v_user_id, lower(v_email), split_part(lower(v_email), '@', 1), 'reviewer', false, false, '["tr","en"]'::jsonb);
    ELSE
      INSERT INTO public.profiles (id, email, username, role, is_admin, is_blocked, languages)
      VALUES (v_user_id, lower(v_email), split_part(lower(v_email), '@', 1), 'reviewer', false, false, ARRAY['tr', 'en']::text[]);
    END IF;
  ELSE
    UPDATE public.profiles
    SET role = 'reviewer', is_admin = false, email = lower(v_email), is_blocked = false
    WHERE id = v_user_id;
  END IF;
END $$;

SELECT
  u.id,
  u.email AS auth_email,
  p.email AS profile_email,
  p.username,
  p.role,
  p.is_admin,
  p.is_blocked
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE lower(trim(u.email)) = lower('yakuphanno@gmail.com');
