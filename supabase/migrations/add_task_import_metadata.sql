-- ZIP / uzak içe aktarma için iz sürme ve medya proxy yolu
alter table public.tasks add column if not exists import_source text;
alter table public.tasks add column if not exists media_storage_path text;

comment on column public.tasks.import_source is 'Örn: zip_import';
comment on column public.tasks.media_storage_path is 'task-assets bucket içi nesne yolu (imzalı URL / proxy için)';
