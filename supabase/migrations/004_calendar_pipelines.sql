-- Per-user content pipelines for scheduler

create table if not exists public.content_pipelines (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  color text not null default '#64748b',
  days_of_week int[] not null default '{0,1,2,3,4,5,6}',
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

alter table public.content_pipelines enable row level security;

drop policy if exists "content_pipelines_select_own_with_access" on public.content_pipelines;
create policy "content_pipelines_select_own_with_access"
on public.content_pipelines
for select
using (auth.uid() = user_id and public.has_scheduler_access(auth.uid()));

drop policy if exists "content_pipelines_insert_own_with_access" on public.content_pipelines;
create policy "content_pipelines_insert_own_with_access"
on public.content_pipelines
for insert
with check (auth.uid() = user_id and public.has_scheduler_access(auth.uid()));

drop policy if exists "content_pipelines_update_own_with_access" on public.content_pipelines;
create policy "content_pipelines_update_own_with_access"
on public.content_pipelines
for update
using (auth.uid() = user_id and public.has_scheduler_access(auth.uid()))
with check (auth.uid() = user_id and public.has_scheduler_access(auth.uid()));

drop policy if exists "content_pipelines_delete_own_with_access" on public.content_pipelines;
create policy "content_pipelines_delete_own_with_access"
on public.content_pipelines
for delete
using (auth.uid() = user_id and public.has_scheduler_access(auth.uid()));

alter table public.content_items
  add column if not exists pipeline_key text;

update public.content_items
set pipeline_key = type
where pipeline_key is null;
