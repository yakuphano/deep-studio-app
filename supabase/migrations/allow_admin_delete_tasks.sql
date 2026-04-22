-- Admin kullanıcıların tasks tablosundan silmesine izin ver (RLS açıksa gerekli)
-- profiles.is_admin = true olan auth kullanıcıları için DELETE

DROP POLICY IF EXISTS "Admins can delete tasks" ON public.tasks;

CREATE POLICY "Admins can delete tasks"
ON public.tasks
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.is_admin IS TRUE
  )
);
