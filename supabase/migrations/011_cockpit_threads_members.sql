-- Coding Cockpit phase 3: thread archiving and shared members

alter table public.cockpit_threads
  add column if not exists archived_at timestamptz,
  add column if not exists delete_after timestamptz;

create table if not exists public.cockpit_thread_members (
  id bigserial primary key,
  thread_id bigint not null references public.cockpit_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (thread_id, user_id)
);

create index if not exists cockpit_thread_members_thread_id_idx
  on public.cockpit_thread_members (thread_id, created_at asc);

create index if not exists cockpit_thread_members_user_id_idx
  on public.cockpit_thread_members (user_id, created_at desc);

create or replace function public.cockpit_thread_is_member(target_thread_id bigint, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cockpit_thread_members m
    where m.thread_id = target_thread_id
      and m.user_id = target_user_id
  );
$$;

create or replace function public.cockpit_thread_is_owner(target_thread_id bigint, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cockpit_thread_members m
    where m.thread_id = target_thread_id
      and m.user_id = target_user_id
      and m.role = 'owner'
  );
$$;

create or replace function public.cockpit_thread_members_insert_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cockpit_thread_members (thread_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict (thread_id, user_id) do update
  set role = 'owner';

  return new;
end;
$$;

create or replace function public.cockpit_thread_members_guard_owner_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_owner_count integer;
begin
  if old.role <> 'owner' then
    return old;
  end if;

  -- Serialize owner-removal checks per thread to avoid concurrent last-owner deletes.
  perform pg_advisory_xact_lock(old.thread_id);

  select count(*)::integer
  into remaining_owner_count
  from public.cockpit_thread_members m
  where m.thread_id = old.thread_id
    and m.role = 'owner'
    and m.id <> old.id;

  if remaining_owner_count < 1 then
    raise exception 'Cannot remove the last remaining owner from a thread.'
      using errcode = '23514';
  end if;

  return old;
end;
$$;

insert into public.cockpit_thread_members (thread_id, user_id, role)
select t.id, t.user_id, 'owner'
from public.cockpit_threads t
on conflict (thread_id, user_id) do update
set role = 'owner';

drop trigger if exists cockpit_threads_insert_owner_member on public.cockpit_threads;
create trigger cockpit_threads_insert_owner_member
after insert on public.cockpit_threads
for each row execute procedure public.cockpit_thread_members_insert_owner();

drop trigger if exists cockpit_thread_members_guard_owner_delete on public.cockpit_thread_members;
create trigger cockpit_thread_members_guard_owner_delete
before delete on public.cockpit_thread_members
for each row execute procedure public.cockpit_thread_members_guard_owner_delete();

alter table public.cockpit_thread_members enable row level security;

-- cockpit_threads policies
 drop policy if exists "cockpit_threads_select_own" on public.cockpit_threads;
drop policy if exists "cockpit_threads_insert_own" on public.cockpit_threads;
drop policy if exists "cockpit_threads_update_own" on public.cockpit_threads;
drop policy if exists "cockpit_threads_delete_own" on public.cockpit_threads;
drop policy if exists "cockpit_threads_select_member" on public.cockpit_threads;
drop policy if exists "cockpit_threads_insert_owner" on public.cockpit_threads;
drop policy if exists "cockpit_threads_update_owner" on public.cockpit_threads;
drop policy if exists "cockpit_threads_delete_owner" on public.cockpit_threads;

create policy "cockpit_threads_select_member"
on public.cockpit_threads
for select
using (
  public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_member(id, auth.uid())
);

create policy "cockpit_threads_insert_owner"
on public.cockpit_threads
for insert
with check (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
);

create policy "cockpit_threads_update_owner"
on public.cockpit_threads
for update
using (
  public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_owner(id, auth.uid())
)
with check (
  public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_owner(id, auth.uid())
);

create policy "cockpit_threads_delete_owner"
on public.cockpit_threads
for delete
using (
  public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_owner(id, auth.uid())
);

-- cockpit_thread_members policies
 drop policy if exists "cockpit_thread_members_select_member" on public.cockpit_thread_members;
drop policy if exists "cockpit_thread_members_insert_owner" on public.cockpit_thread_members;
drop policy if exists "cockpit_thread_members_update_owner" on public.cockpit_thread_members;
drop policy if exists "cockpit_thread_members_delete_owner" on public.cockpit_thread_members;

create policy "cockpit_thread_members_select_member"
on public.cockpit_thread_members
for select
using (
  public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_member(thread_id, auth.uid())
);

create policy "cockpit_thread_members_insert_owner"
on public.cockpit_thread_members
for insert
with check (
  public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_member(thread_id, auth.uid())
  and role = 'member'
);

create policy "cockpit_thread_members_update_owner"
on public.cockpit_thread_members
for update
using (
  public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_owner(thread_id, auth.uid())
)
with check (
  public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_owner(thread_id, auth.uid())
);

create policy "cockpit_thread_members_delete_owner"
on public.cockpit_thread_members
for delete
using (
  public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_member(thread_id, auth.uid())
);

-- cockpit_messages policies
 drop policy if exists "cockpit_messages_select_own" on public.cockpit_messages;
drop policy if exists "cockpit_messages_insert_own" on public.cockpit_messages;
drop policy if exists "cockpit_messages_update_own" on public.cockpit_messages;
drop policy if exists "cockpit_messages_delete_own" on public.cockpit_messages;
drop policy if exists "cockpit_messages_select_member" on public.cockpit_messages;
drop policy if exists "cockpit_messages_insert_member" on public.cockpit_messages;

create policy "cockpit_messages_select_member"
on public.cockpit_messages
for select
using (
  public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_member(thread_id, auth.uid())
);

create policy "cockpit_messages_insert_member"
on public.cockpit_messages
for insert
with check (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_member(thread_id, auth.uid())
);

-- cockpit_attachments policies
 drop policy if exists "cockpit_attachments_select_own" on public.cockpit_attachments;
drop policy if exists "cockpit_attachments_insert_own" on public.cockpit_attachments;
drop policy if exists "cockpit_attachments_update_own" on public.cockpit_attachments;
drop policy if exists "cockpit_attachments_delete_own" on public.cockpit_attachments;
drop policy if exists "cockpit_attachments_select_member" on public.cockpit_attachments;
drop policy if exists "cockpit_attachments_insert_member" on public.cockpit_attachments;
drop policy if exists "cockpit_attachments_update_member" on public.cockpit_attachments;
drop policy if exists "cockpit_attachments_delete_member" on public.cockpit_attachments;

create policy "cockpit_attachments_select_member"
on public.cockpit_attachments
for select
using (
  public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_member(thread_id, auth.uid())
);

create policy "cockpit_attachments_insert_member"
on public.cockpit_attachments
for insert
with check (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_member(thread_id, auth.uid())
);

create policy "cockpit_attachments_update_member"
on public.cockpit_attachments
for update
using (
  public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_member(thread_id, auth.uid())
)
with check (
  public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_member(thread_id, auth.uid())
);

create policy "cockpit_attachments_delete_member"
on public.cockpit_attachments
for delete
using (
  public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_member(thread_id, auth.uid())
);

-- cockpit_annotations policies
 drop policy if exists "cockpit_annotations_select_own" on public.cockpit_annotations;
drop policy if exists "cockpit_annotations_insert_own" on public.cockpit_annotations;
drop policy if exists "cockpit_annotations_update_own" on public.cockpit_annotations;
drop policy if exists "cockpit_annotations_delete_own" on public.cockpit_annotations;
drop policy if exists "cockpit_annotations_select_member" on public.cockpit_annotations;
drop policy if exists "cockpit_annotations_insert_member" on public.cockpit_annotations;
drop policy if exists "cockpit_annotations_update_member" on public.cockpit_annotations;
drop policy if exists "cockpit_annotations_delete_member" on public.cockpit_annotations;

create policy "cockpit_annotations_select_member"
on public.cockpit_annotations
for select
using (
  public.has_cockpit_access(auth.uid())
  and exists (
    select 1
    from public.cockpit_attachments a
    where a.id = cockpit_annotations.attachment_id
      and public.cockpit_thread_is_member(a.thread_id, auth.uid())
  )
);

create policy "cockpit_annotations_insert_member"
on public.cockpit_annotations
for insert
with check (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and exists (
    select 1
    from public.cockpit_attachments a
    where a.id = cockpit_annotations.attachment_id
      and public.cockpit_thread_is_member(a.thread_id, auth.uid())
  )
);

create policy "cockpit_annotations_update_member"
on public.cockpit_annotations
for update
using (
  public.has_cockpit_access(auth.uid())
  and exists (
    select 1
    from public.cockpit_attachments a
    where a.id = cockpit_annotations.attachment_id
      and public.cockpit_thread_is_member(a.thread_id, auth.uid())
  )
)
with check (
  public.has_cockpit_access(auth.uid())
  and exists (
    select 1
    from public.cockpit_attachments a
    where a.id = cockpit_annotations.attachment_id
      and public.cockpit_thread_is_member(a.thread_id, auth.uid())
  )
);

create policy "cockpit_annotations_delete_member"
on public.cockpit_annotations
for delete
using (
  public.has_cockpit_access(auth.uid())
  and exists (
    select 1
    from public.cockpit_attachments a
    where a.id = cockpit_annotations.attachment_id
      and public.cockpit_thread_is_member(a.thread_id, auth.uid())
  )
);

-- cockpit_jobs policies
 drop policy if exists "cockpit_jobs_select_own" on public.cockpit_jobs;
drop policy if exists "cockpit_jobs_insert_own" on public.cockpit_jobs;
drop policy if exists "cockpit_jobs_select_member" on public.cockpit_jobs;
drop policy if exists "cockpit_jobs_insert_member" on public.cockpit_jobs;
drop policy if exists "cockpit_jobs_update_member" on public.cockpit_jobs;
drop policy if exists "cockpit_jobs_delete_member" on public.cockpit_jobs;

create policy "cockpit_jobs_select_member"
on public.cockpit_jobs
for select
using (
  public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_member(thread_id, auth.uid())
);

create policy "cockpit_jobs_insert_member"
on public.cockpit_jobs
for insert
with check (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_member(thread_id, auth.uid())
);

create policy "cockpit_jobs_update_member"
on public.cockpit_jobs
for update
using (
  public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_member(thread_id, auth.uid())
)
with check (
  public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_member(thread_id, auth.uid())
);

create policy "cockpit_jobs_delete_member"
on public.cockpit_jobs
for delete
using (
  public.has_cockpit_access(auth.uid())
  and public.cockpit_thread_is_member(thread_id, auth.uid())
);
