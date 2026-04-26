-- Demo görevler: Medical ve LiDAR (dashboard kartlarından açılır)
-- Tekrar çalıştırmada çakışma olmaması için sabit UUID kullanılır.

INSERT INTO public.tasks (
  id,
  title,
  company_name,
  type,
  category,
  annotation_type,
  status,
  language,
  price,
  image_url,
  description,
  is_pool_task,
  assigned_to
) VALUES
(
  'a1111111-1111-4111-8111-111111111101',
  'Demo — Chest X-ray region markup',
  'Deep Studio',
  'medical',
  'medical',
  'bbox',
  'pending',
  'tr',
  25,
  'https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=900&q=80',
  'Örnek tıbbi görüntü görevi: lezyon ve organ bölgelerini işaretleyin.',
  true,
  NULL
),
(
  'a2222222-2222-4222-8222-222222222202',
  'Demo — LiDAR bird''s-eye view',
  'Deep Studio',
  'lidar',
  'lidar',
  'polygon',
  'pending',
  'tr',
  25,
  'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=900&q=80',
  'Örnek LiDAR BEV görüntüsü: araç ve engelleri polygon ile çizin.',
  true,
  NULL
)
ON CONFLICT (id) DO NOTHING;
