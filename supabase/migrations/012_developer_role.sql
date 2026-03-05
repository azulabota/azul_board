-- Add developer role + helper functions

-- Expand the allowed roles in public.user_roles
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles
  add constraint user_roles_role_check check (role in ('admin', 'user', 'developer'));

create or replace function public.is_developer(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = uid
      and role = 'developer'
  );
$$;

-- Developers OR admins (admins should have developer powers)
create or replace function public.has_developer_access(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.status = 'active'
  )
  and (
    public.is_admin(uid)
    or public.is_developer(uid)
  );
$$;
