-- Görev yapım kılavuzu (PDF, Word, metin, görsel vb.)
alter table public.tasks add column if not exists guideline_url text;
alter table public.tasks add column if not exists guideline_storage_path text;
alter table public.tasks add column if not exists guideline_file_name text;

comment on column public.tasks.guideline_url is 'Public URL for task guideline document in task-assets bucket';
comment on column public.tasks.guideline_storage_path is 'Object path under task-assets/guidelines/…';
comment on column public.tasks.guideline_file_name is 'Original filename shown to workers';
