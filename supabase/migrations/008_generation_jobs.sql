-- Queue table for asynchronous calendar generation

create table if not exists public.generation_jobs (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'pipeline_week',
  pipeline_key text,
  days int not null default 7,
  platform text not null default 'X',
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  payload jsonb
);

create index if not exists generation_jobs_user_created_idx
  on public.generation_jobs (user_id, created_at desc);

create index if not exists generation_jobs_status_created_idx
  on public.generation_jobs (status, created_at asc);

alter table public.generation_jobs enable row level security;

drop policy if exists "generation_jobs_select_own_with_access" on public.generation_jobs;
create policy "generation_jobs_select_own_with_access"
on public.generation_jobs
for select
using (auth.uid() = user_id and public.has_scheduler_access(auth.uid()));

drop policy if exists "generation_jobs_insert_own_with_access" on public.generation_jobs;
create policy "generation_jobs_insert_own_with_access"
on public.generation_jobs
for insert
with check (auth.uid() = user_id and public.has_scheduler_access(auth.uid()));
