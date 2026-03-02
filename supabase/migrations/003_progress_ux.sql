-- Progress UX schema updates: unified issue workflow + structured updates

-- Tasks: add issue type and normalize statuses
alter table public.tasks
  add column if not exists type text not null default 'task';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_type_check'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_type_check check (type in ('task', 'bug'));
  end if;
end $$;

-- Map legacy statuses into the new workflow
update public.tasks
set status = case
  when status in ('todo', 'in_progress', 'blocked', 'done') then status
  when status in ('needs_review', 'review', 'in review', 'in-review') then 'in_progress'
  when status in ('published', 'completed', 'complete') then 'done'
  else 'todo'
end;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'tasks_status_check'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks drop constraint tasks_status_check;
  end if;

  alter table public.tasks
    add constraint tasks_status_check
    check (status in ('todo', 'in_progress', 'blocked', 'done'));
end $$;

-- Revisions: structured update fields + normalized statuses
alter table public.revisions
  add column if not exists what_changed text,
  add column if not exists next_steps text;

update public.revisions
set status = case
  when status in ('todo', 'in_progress', 'blocked', 'done') then status
  when status in ('needs_review', 'review', 'in review', 'in-review') then 'in_progress'
  when status in ('published', 'completed', 'complete') then 'done'
  else 'todo'
end;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'revisions_status_check'
      and conrelid = 'public.revisions'::regclass
  ) then
    alter table public.revisions drop constraint revisions_status_check;
  end if;

  alter table public.revisions
    add constraint revisions_status_check
    check (status in ('todo', 'in_progress', 'blocked', 'done'));
end $$;
