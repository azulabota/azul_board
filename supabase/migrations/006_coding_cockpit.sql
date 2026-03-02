-- Coding Cockpit phase 1: threads, messages, attachments, annotations, and encrypted AI connections

create table if not exists public.cockpit_threads (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cockpit_messages (
  id bigserial primary key,
  thread_id bigint not null references public.cockpit_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text,
  created_at timestamptz not null default now()
);

create table if not exists public.cockpit_attachments (
  id bigserial primary key,
  thread_id bigint not null references public.cockpit_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  filename text,
  content_type text,
  size_bytes bigint,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.cockpit_annotations (
  id bigserial primary key,
  attachment_id bigint not null references public.cockpit_attachments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_ai_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  bot_base_url text,
  bot_token_ciphertext text,
  bot_token_iv text,
  bot_token_tag text,
  openai_key_ciphertext text,
  openai_key_iv text,
  openai_key_tag text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cockpit_threads_user_id_idx on public.cockpit_threads (user_id, updated_at desc);
create index if not exists cockpit_messages_thread_id_idx on public.cockpit_messages (thread_id, created_at asc);
create index if not exists cockpit_attachments_thread_id_idx on public.cockpit_attachments (thread_id, created_at desc);
create index if not exists cockpit_annotations_attachment_id_idx on public.cockpit_annotations (attachment_id, created_at asc);

create or replace function public.has_cockpit_access(uid uuid)
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

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_cockpit_threads_updated_at on public.cockpit_threads;
create trigger touch_cockpit_threads_updated_at
before update on public.cockpit_threads
for each row execute procedure public.touch_updated_at();

drop trigger if exists touch_user_ai_connections_updated_at on public.user_ai_connections;
create trigger touch_user_ai_connections_updated_at
before update on public.user_ai_connections
for each row execute procedure public.touch_updated_at();

alter table public.cockpit_threads enable row level security;
alter table public.cockpit_messages enable row level security;
alter table public.cockpit_attachments enable row level security;
alter table public.cockpit_annotations enable row level security;
alter table public.user_ai_connections enable row level security;

drop policy if exists "cockpit_threads_select_own" on public.cockpit_threads;
create policy "cockpit_threads_select_own"
on public.cockpit_threads
for select
using (auth.uid() = user_id and public.has_cockpit_access(auth.uid()));

drop policy if exists "cockpit_threads_insert_own" on public.cockpit_threads;
create policy "cockpit_threads_insert_own"
on public.cockpit_threads
for insert
with check (auth.uid() = user_id and public.has_cockpit_access(auth.uid()));

drop policy if exists "cockpit_threads_update_own" on public.cockpit_threads;
create policy "cockpit_threads_update_own"
on public.cockpit_threads
for update
using (auth.uid() = user_id and public.has_cockpit_access(auth.uid()))
with check (auth.uid() = user_id and public.has_cockpit_access(auth.uid()));

drop policy if exists "cockpit_threads_delete_own" on public.cockpit_threads;
create policy "cockpit_threads_delete_own"
on public.cockpit_threads
for delete
using (auth.uid() = user_id and public.has_cockpit_access(auth.uid()));

drop policy if exists "cockpit_messages_select_own" on public.cockpit_messages;
create policy "cockpit_messages_select_own"
on public.cockpit_messages
for select
using (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and exists (
    select 1 from public.cockpit_threads t
    where t.id = cockpit_messages.thread_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "cockpit_messages_insert_own" on public.cockpit_messages;
create policy "cockpit_messages_insert_own"
on public.cockpit_messages
for insert
with check (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and exists (
    select 1 from public.cockpit_threads t
    where t.id = cockpit_messages.thread_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "cockpit_messages_update_own" on public.cockpit_messages;
create policy "cockpit_messages_update_own"
on public.cockpit_messages
for update
using (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and exists (
    select 1 from public.cockpit_threads t
    where t.id = cockpit_messages.thread_id
      and t.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and exists (
    select 1 from public.cockpit_threads t
    where t.id = cockpit_messages.thread_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "cockpit_messages_delete_own" on public.cockpit_messages;
create policy "cockpit_messages_delete_own"
on public.cockpit_messages
for delete
using (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and exists (
    select 1 from public.cockpit_threads t
    where t.id = cockpit_messages.thread_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "cockpit_attachments_select_own" on public.cockpit_attachments;
create policy "cockpit_attachments_select_own"
on public.cockpit_attachments
for select
using (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and exists (
    select 1 from public.cockpit_threads t
    where t.id = cockpit_attachments.thread_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "cockpit_attachments_insert_own" on public.cockpit_attachments;
create policy "cockpit_attachments_insert_own"
on public.cockpit_attachments
for insert
with check (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and exists (
    select 1 from public.cockpit_threads t
    where t.id = cockpit_attachments.thread_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "cockpit_attachments_update_own" on public.cockpit_attachments;
create policy "cockpit_attachments_update_own"
on public.cockpit_attachments
for update
using (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and exists (
    select 1 from public.cockpit_threads t
    where t.id = cockpit_attachments.thread_id
      and t.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and exists (
    select 1 from public.cockpit_threads t
    where t.id = cockpit_attachments.thread_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "cockpit_attachments_delete_own" on public.cockpit_attachments;
create policy "cockpit_attachments_delete_own"
on public.cockpit_attachments
for delete
using (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and exists (
    select 1 from public.cockpit_threads t
    where t.id = cockpit_attachments.thread_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "cockpit_annotations_select_own" on public.cockpit_annotations;
create policy "cockpit_annotations_select_own"
on public.cockpit_annotations
for select
using (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and exists (
    select 1
    from public.cockpit_attachments a
    join public.cockpit_threads t on t.id = a.thread_id
    where a.id = cockpit_annotations.attachment_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "cockpit_annotations_insert_own" on public.cockpit_annotations;
create policy "cockpit_annotations_insert_own"
on public.cockpit_annotations
for insert
with check (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and exists (
    select 1
    from public.cockpit_attachments a
    join public.cockpit_threads t on t.id = a.thread_id
    where a.id = cockpit_annotations.attachment_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "cockpit_annotations_update_own" on public.cockpit_annotations;
create policy "cockpit_annotations_update_own"
on public.cockpit_annotations
for update
using (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and exists (
    select 1
    from public.cockpit_attachments a
    join public.cockpit_threads t on t.id = a.thread_id
    where a.id = cockpit_annotations.attachment_id
      and t.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and exists (
    select 1
    from public.cockpit_attachments a
    join public.cockpit_threads t on t.id = a.thread_id
    where a.id = cockpit_annotations.attachment_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "cockpit_annotations_delete_own" on public.cockpit_annotations;
create policy "cockpit_annotations_delete_own"
on public.cockpit_annotations
for delete
using (
  auth.uid() = user_id
  and public.has_cockpit_access(auth.uid())
  and exists (
    select 1
    from public.cockpit_attachments a
    join public.cockpit_threads t on t.id = a.thread_id
    where a.id = cockpit_annotations.attachment_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "user_ai_connections_select_own" on public.user_ai_connections;
create policy "user_ai_connections_select_own"
on public.user_ai_connections
for select
using (auth.uid() = user_id and public.has_cockpit_access(auth.uid()));

drop policy if exists "user_ai_connections_insert_own" on public.user_ai_connections;
create policy "user_ai_connections_insert_own"
on public.user_ai_connections
for insert
with check (auth.uid() = user_id and public.has_cockpit_access(auth.uid()));

drop policy if exists "user_ai_connections_update_own" on public.user_ai_connections;
create policy "user_ai_connections_update_own"
on public.user_ai_connections
for update
using (auth.uid() = user_id and public.has_cockpit_access(auth.uid()))
with check (auth.uid() = user_id and public.has_cockpit_access(auth.uid()));

drop policy if exists "user_ai_connections_delete_own" on public.user_ai_connections;
create policy "user_ai_connections_delete_own"
on public.user_ai_connections
for delete
using (auth.uid() = user_id and public.has_cockpit_access(auth.uid()));
