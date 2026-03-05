-- Coding Cockpit v2: projects + iterations + assets (developer-only)

-- Allowed repos (admin-managed allowlist)
create table if not exists public.cockpit_allowed_repos (
  id bigserial primary key,
  repo_url text not null,
  default_branch text not null default 'main',
  notes text,
  created_at timestamptz not null default now(),
  unique (repo_url)
);

alter table public.cockpit_allowed_repos enable row level security;

drop policy if exists "cockpit_allowed_repos_select_developer" on public.cockpit_allowed_repos;
create policy "cockpit_allowed_repos_select_developer"
on public.cockpit_allowed_repos
for select
using (public.has_developer_access(auth.uid()));

drop policy if exists "cockpit_allowed_repos_admin_write" on public.cockpit_allowed_repos;
create policy "cockpit_allowed_repos_admin_write"
on public.cockpit_allowed_repos
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- Projects
create table if not exists public.cockpit_projects (
  id bigserial primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  repo_url text,
  default_branch text not null default 'main',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  delete_after timestamptz
);

create index if not exists cockpit_projects_owner_updated_idx
  on public.cockpit_projects (owner_id, updated_at desc);

create index if not exists cockpit_projects_deleted_idx
  on public.cockpit_projects (deleted_at, delete_after);

alter table public.cockpit_projects enable row level security;

-- Members (private-by-default: only members can see)
create table if not exists public.cockpit_project_members (
  id bigserial primary key,
  project_id bigint not null references public.cockpit_projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index if not exists cockpit_project_members_project_id_idx
  on public.cockpit_project_members (project_id, created_at asc);

create index if not exists cockpit_project_members_user_id_idx
  on public.cockpit_project_members (user_id, created_at desc);

alter table public.cockpit_project_members enable row level security;

create or replace function public.cockpit_project_is_member(target_project_id bigint, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cockpit_project_members m
    where m.project_id = target_project_id
      and m.user_id = target_user_id
  );
$$;

create or replace function public.cockpit_project_is_owner(target_project_id bigint, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cockpit_project_members m
    where m.project_id = target_project_id
      and m.user_id = target_user_id
      and m.role = 'owner'
  );
$$;

create or replace function public.cockpit_project_members_insert_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cockpit_project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (project_id, user_id) do update
  set role = 'owner';

  return new;
end;
$$;

drop trigger if exists touch_cockpit_projects_updated_at on public.cockpit_projects;
create trigger touch_cockpit_projects_updated_at
before update on public.cockpit_projects
for each row execute procedure public.touch_updated_at();

drop trigger if exists cockpit_projects_insert_owner_member on public.cockpit_projects;
create trigger cockpit_projects_insert_owner_member
after insert on public.cockpit_projects
for each row execute procedure public.cockpit_project_members_insert_owner();

-- Backfill owner membership for existing rows (safe)
insert into public.cockpit_project_members (project_id, user_id, role)
select p.id, p.owner_id, 'owner'
from public.cockpit_projects p
on conflict (project_id, user_id) do update
set role = 'owner';

-- Policies: projects
drop policy if exists "cockpit_projects_select_member" on public.cockpit_projects;
drop policy if exists "cockpit_projects_insert_owner" on public.cockpit_projects;
drop policy if exists "cockpit_projects_update_owner" on public.cockpit_projects;
drop policy if exists "cockpit_projects_delete_owner" on public.cockpit_projects;

create policy "cockpit_projects_select_member"
on public.cockpit_projects
for select
using (
  public.has_developer_access(auth.uid())
  and deleted_at is null
  and public.cockpit_project_is_member(id, auth.uid())
);

create policy "cockpit_projects_insert_owner"
on public.cockpit_projects
for insert
with check (
  public.has_developer_access(auth.uid())
  and auth.uid() = owner_id
);

create policy "cockpit_projects_update_owner"
on public.cockpit_projects
for update
using (
  public.has_developer_access(auth.uid())
  and public.cockpit_project_is_owner(id, auth.uid())
)
with check (
  public.has_developer_access(auth.uid())
  and public.cockpit_project_is_owner(id, auth.uid())
);

-- Delete is soft-delete via update; still block hard delete from client.
create policy "cockpit_projects_delete_owner"
on public.cockpit_projects
for delete
using (
  public.is_admin(auth.uid())
);

-- Policies: project members
drop policy if exists "cockpit_project_members_select_member" on public.cockpit_project_members;
drop policy if exists "cockpit_project_members_insert_owner" on public.cockpit_project_members;
drop policy if exists "cockpit_project_members_update_owner" on public.cockpit_project_members;
drop policy if exists "cockpit_project_members_delete_owner" on public.cockpit_project_members;

create policy "cockpit_project_members_select_member"
on public.cockpit_project_members
for select
using (
  public.has_developer_access(auth.uid())
  and public.cockpit_project_is_member(project_id, auth.uid())
);

-- Owner can add members (role must be member; owner role is controlled by trigger)
create policy "cockpit_project_members_insert_owner"
on public.cockpit_project_members
for insert
with check (
  public.has_developer_access(auth.uid())
  and public.cockpit_project_is_owner(project_id, auth.uid())
  and role = 'member'
);

create policy "cockpit_project_members_update_owner"
on public.cockpit_project_members
for update
using (
  public.has_developer_access(auth.uid())
  and public.cockpit_project_is_owner(project_id, auth.uid())
)
with check (
  public.has_developer_access(auth.uid())
  and public.cockpit_project_is_owner(project_id, auth.uid())
);

create policy "cockpit_project_members_delete_owner"
on public.cockpit_project_members
for delete
using (
  public.has_developer_access(auth.uid())
  and public.cockpit_project_is_owner(project_id, auth.uid())
);

-- Iterations
create table if not exists public.cockpit_project_iterations (
  id bigserial primary key,
  project_id bigint not null references public.cockpit_projects(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text,
  instruction text,
  assignee_user_id uuid references public.profiles(id) on delete set null,
  collab_notes text,
  status text not null default 'draft' check (status in ('draft', 'queued', 'running', 'done', 'failed')),
  pr_url text,
  summary text,
  diff_text text,
  files_json jsonb,
  logs text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cockpit_project_iterations_project_created_idx
  on public.cockpit_project_iterations (project_id, created_at desc);

alter table public.cockpit_project_iterations enable row level security;

drop trigger if exists touch_cockpit_project_iterations_updated_at on public.cockpit_project_iterations;
create trigger touch_cockpit_project_iterations_updated_at
before update on public.cockpit_project_iterations
for each row execute procedure public.touch_updated_at();

drop policy if exists "cockpit_project_iterations_select_member" on public.cockpit_project_iterations;
drop policy if exists "cockpit_project_iterations_insert_member" on public.cockpit_project_iterations;
drop policy if exists "cockpit_project_iterations_update_member" on public.cockpit_project_iterations;

create policy "cockpit_project_iterations_select_member"
on public.cockpit_project_iterations
for select
using (
  public.has_developer_access(auth.uid())
  and public.cockpit_project_is_member(project_id, auth.uid())
);

create policy "cockpit_project_iterations_insert_member"
on public.cockpit_project_iterations
for insert
with check (
  public.has_developer_access(auth.uid())
  and auth.uid() = created_by
  and public.cockpit_project_is_member(project_id, auth.uid())
);

create policy "cockpit_project_iterations_update_member"
on public.cockpit_project_iterations
for update
using (
  public.has_developer_access(auth.uid())
  and public.cockpit_project_is_member(project_id, auth.uid())
)
with check (
  public.has_developer_access(auth.uid())
  and public.cockpit_project_is_member(project_id, auth.uid())
);

-- Assets (uploaded files)
create table if not exists public.cockpit_project_assets (
  id bigserial primary key,
  project_id bigint not null references public.cockpit_projects(id) on delete cascade,
  iteration_id bigint references public.cockpit_project_iterations(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  filename text,
  content_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists cockpit_project_assets_iteration_idx
  on public.cockpit_project_assets (iteration_id, created_at desc);

alter table public.cockpit_project_assets enable row level security;

drop policy if exists "cockpit_project_assets_select_member" on public.cockpit_project_assets;
drop policy if exists "cockpit_project_assets_insert_member" on public.cockpit_project_assets;

create policy "cockpit_project_assets_select_member"
on public.cockpit_project_assets
for select
using (
  public.has_developer_access(auth.uid())
  and public.cockpit_project_is_member(project_id, auth.uid())
);

create policy "cockpit_project_assets_insert_member"
on public.cockpit_project_assets
for insert
with check (
  public.has_developer_access(auth.uid())
  and auth.uid() = uploaded_by
  and public.cockpit_project_is_member(project_id, auth.uid())
);

-- Asset annotations: image shapes + code line comments
create table if not exists public.cockpit_project_asset_annotations (
  id bigserial primary key,
  asset_id bigint not null references public.cockpit_project_assets(id) on delete cascade,
  project_id bigint not null references public.cockpit_projects(id) on delete cascade,
  iteration_id bigint references public.cockpit_project_iterations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'shape' check (kind in ('shape', 'line_comment')),
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists cockpit_project_asset_annotations_asset_idx
  on public.cockpit_project_asset_annotations (asset_id, created_at asc);

alter table public.cockpit_project_asset_annotations enable row level security;

drop policy if exists "cockpit_project_asset_annotations_select_member" on public.cockpit_project_asset_annotations;
drop policy if exists "cockpit_project_asset_annotations_insert_member" on public.cockpit_project_asset_annotations;

create policy "cockpit_project_asset_annotations_select_member"
on public.cockpit_project_asset_annotations
for select
using (
  public.has_developer_access(auth.uid())
  and public.cockpit_project_is_member(project_id, auth.uid())
);

create policy "cockpit_project_asset_annotations_insert_member"
on public.cockpit_project_asset_annotations
for insert
with check (
  public.has_developer_access(auth.uid())
  and auth.uid() = user_id
  and public.cockpit_project_is_member(project_id, auth.uid())
);
