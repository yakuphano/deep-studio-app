-- QA incelemesi: reddet / onay meta verisi
alter table public.tasks add column if not exists qa_comment text;
alter table public.tasks add column if not exists qa_reviewed_by uuid;
alter table public.tasks add column if not exists qa_reviewed_at timestamptz;

comment on column public.tasks.qa_comment is 'QA reddi veya not metni';
comment on column public.tasks.qa_reviewed_by is 'Son QA kararını veren kullanıcı';
comment on column public.tasks.qa_reviewed_at is 'Son QA kararı zamanı';

-- status: rejected = annotator düzeltmeli (assigned_to korunur)
