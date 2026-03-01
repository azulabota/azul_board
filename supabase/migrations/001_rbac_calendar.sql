-- RBAC, approval flow, and per-user content calendar

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  first_name text,
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin', 'user')),
  unique (user_id, role)
);

create table if not exists public.user_permissions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  can_use_dev_dashboard boolean not null default false,
  can_use_scheduler boolean not null default false
);

create table if not exists public.content_items (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  title text not null,
  type text not null,
  content text,
  status text not null default 'scheduled',
  platform text not null default 'X',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_permissions enable row level security;
alter table public.content_items enable row level security;

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = uid and role = 'admin'
  );
$$;

create or replace function public.has_scheduler_access(uid uuid)
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
      and up.can_use_scheduler = true
  );
$$;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
using (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "profiles_insert_service_role" on public.profiles;
create policy "profiles_insert_service_role"
on public.profiles
for insert
with check (auth.role() = 'service_role');

drop policy if exists "user_permissions_select_own_or_admin" on public.user_permissions;
create policy "user_permissions_select_own_or_admin"
on public.user_permissions
for select
using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "user_permissions_update_admin" on public.user_permissions;
create policy "user_permissions_update_admin"
on public.user_permissions
for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "user_permissions_insert_service_role" on public.user_permissions;
create policy "user_permissions_insert_service_role"
on public.user_permissions
for insert
with check (auth.role() = 'service_role');

drop policy if exists "user_roles_select_own_or_admin" on public.user_roles;
create policy "user_roles_select_own_or_admin"
on public.user_roles
for select
using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "user_roles_insert_admin" on public.user_roles;
create policy "user_roles_insert_admin"
on public.user_roles
for insert
with check (public.is_admin(auth.uid()));

drop policy if exists "user_roles_delete_admin" on public.user_roles;
create policy "user_roles_delete_admin"
on public.user_roles
for delete
using (public.is_admin(auth.uid()));

drop policy if exists "content_items_select_own_with_access" on public.content_items;
create policy "content_items_select_own_with_access"
on public.content_items
for select
using (auth.uid() = user_id and public.has_scheduler_access(auth.uid()));

drop policy if exists "content_items_insert_own_with_access" on public.content_items;
create policy "content_items_insert_own_with_access"
on public.content_items
for insert
with check (auth.uid() = user_id and public.has_scheduler_access(auth.uid()));

drop policy if exists "content_items_update_own_with_access" on public.content_items;
create policy "content_items_update_own_with_access"
on public.content_items
for update
using (auth.uid() = user_id and public.has_scheduler_access(auth.uid()))
with check (auth.uid() = user_id and public.has_scheduler_access(auth.uid()));

drop policy if exists "content_items_delete_own_with_access" on public.content_items;
create policy "content_items_delete_own_with_access"
on public.content_items
for delete
using (auth.uid() = user_id and public.has_scheduler_access(auth.uid()));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    'pending'
  )
  on conflict (id) do update
    set email = excluded.email,
        first_name = coalesce(excluded.first_name, public.profiles.first_name);

  insert into public.user_permissions (user_id, can_use_dev_dashboard, can_use_scheduler)
  values (new.id, false, false)
  on conflict (user_id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
