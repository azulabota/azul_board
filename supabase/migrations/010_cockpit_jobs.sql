create table if not exists public.cockpit_jobs (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id bigint not null references public.cockpit_threads(id) on delete cascade,
  prompt text not null,
  selected_attachment_ids bigint[] not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  result_message_id bigint
);

create index if not exists cockpit_jobs_user_created_idx
  on public.cockpit_jobs (user_id, created_at desc);

create index if not exists cockpit_jobs_status_created_idx
  on public.cockpit_jobs (status, created_at asc);

create index if not exists cockpit_jobs_thread_created_idx
  on public.cockpit_jobs (thread_id, created_at desc);

alter table public.cockpit_jobs enable row level security;

drop policy if exists "cockpit_jobs_select_own" on public.cockpit_jobs;
create policy "cockpit_jobs_select_own"
on public.cockpit_jobs
for select
using (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and exists (
    select 1
    from public.cockpit_threads t
    where t.id = cockpit_jobs.thread_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "cockpit_jobs_insert_own" on public.cockpit_jobs;
create policy "cockpit_jobs_insert_own"
on public.cockpit_jobs
for insert
with check (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and exists (
    select 1
    from public.cockpit_threads t
    where t.id = cockpit_jobs.thread_id
      and t.user_id = auth.uid()
  )
);
