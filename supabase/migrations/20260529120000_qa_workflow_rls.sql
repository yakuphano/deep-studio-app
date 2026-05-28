-- QA workflow: reviewers can act on submitted tasks; completed tasks readable for export.
-- Keeps broad SELECT for authenticated users so pool/claim flows keep working.

create or replace function public.profile_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        coalesce(p.is_admin, false) = true
        or lower(trim(coalesce(p.role, ''))) = 'admin'
      )
  );
$$;

create or replace function public.profile_is_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(trim(coalesce(p.role, ''))) in (
        'reviewer',
        'qa_reviewer',
        'qareviewer',
        'quality_controller',
        'qualitycontroller'
      )
  );
$$;

alter table public.tasks enable row level security;

drop policy if exists "tasks_select_authenticated" on public.tasks;
create policy "tasks_select_authenticated"
on public.tasks
for select
to authenticated
using (true);

drop policy if exists "admin_tasks_all_update" on public.tasks;
create policy "admin_tasks_all_update"
on public.tasks
for update
to authenticated
using (public.profile_is_admin())
with check (public.profile_is_admin());

drop policy if exists "reviewer_qa_update_submitted" on public.tasks;
create policy "reviewer_qa_update_submitted"
on public.tasks
for update
to authenticated
using (
  public.profile_is_reviewer()
  and status = 'submitted'
)
with check (
  public.profile_is_reviewer()
  and status in ('completed', 'rejected')
);

drop policy if exists "assignee_update_own_task" on public.tasks;
create policy "assignee_update_own_task"
on public.tasks
for update
to authenticated
using (assigned_to = auth.uid())
with check (assigned_to = auth.uid());

drop policy if exists "pool_claim_pending_task" on public.tasks;
create policy "pool_claim_pending_task"
on public.tasks
for update
to authenticated
using (
  coalesce(is_pool_task, false) = true
  and assigned_to is null
  and status = 'pending'
)
with check (assigned_to = auth.uid());

comment on function public.profile_is_reviewer() is 'QA / kalite kontrol kullanıcısı (profiles.role)';
