-- API key auth support + tightened dev dashboard RLS

create table if not exists public.api_keys (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text,
  key_hash text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create unique index if not exists api_keys_key_hash_idx on public.api_keys (key_hash);

alter table public.api_keys enable row level security;

create or replace function public.has_dev_access(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.user_permissions up on up.user_id = p.id
    where p.id = uid
      and p.status = 'active'
      and up.can_use_dev_dashboard = true
  );
$$;

drop policy if exists "api_keys_select_own" on public.api_keys;
create policy "api_keys_select_own"
on public.api_keys
for select
using (auth.uid() = user_id);

drop policy if exists "api_keys_revoke_own" on public.api_keys;
create policy "api_keys_revoke_own"
on public.api_keys
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "api_keys_insert_service_role" on public.api_keys;
create policy "api_keys_insert_service_role"
on public.api_keys
for insert
with check (auth.role() = 'service_role');

drop policy if exists "Users can manage milestones" on public.milestones;
create policy "Users can manage milestones"
on public.milestones
for all
using (public.has_dev_access(auth.uid()))
with check (public.has_dev_access(auth.uid()));

drop policy if exists "Users can manage tasks" on public.tasks;
create policy "Users can manage tasks"
on public.tasks
for all
using (public.has_dev_access(auth.uid()))
with check (public.has_dev_access(auth.uid()));

drop policy if exists "Users can manage files" on public.files;
create policy "Users can manage files"
on public.files
for all
using (public.has_dev_access(auth.uid()))
with check (public.has_dev_access(auth.uid()));

drop policy if exists "Users can manage revisions" on public.revisions;
create policy "Users can manage revisions"
on public.revisions
for all
using (public.has_dev_access(auth.uid()))
with check (public.has_dev_access(auth.uid()));
