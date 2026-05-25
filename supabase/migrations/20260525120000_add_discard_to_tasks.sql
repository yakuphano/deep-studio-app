-- Annotators can mark broken / unusable tasks to skip them.
alter table public.tasks add column if not exists discarded_at timestamptz;
alter table public.tasks add column if not exists discarded_by uuid references auth.users (id) on delete set null;

comment on column public.tasks.discarded_at is 'Worker marked task as discard (broken media, cannot open, etc.)';
comment on column public.tasks.discarded_by is 'User who set discarded_at';

create index if not exists tasks_discarded_at_idx on public.tasks (discarded_at) where discarded_at is not null;
