-- 007_pipeline_times.sql
-- Adds per-pipeline preferred posting time or time window + per-item scheduled timestamp

alter table public.content_pipelines
  add column if not exists timezone text not null default 'America/Denver',
  add column if not exists post_time time,
  add column if not exists post_time_start time,
  add column if not exists post_time_end time;

alter table public.content_items
  add column if not exists scheduled_at timestamptz;

-- Optional index for scheduling queries
create index if not exists content_items_user_scheduled_at_idx
  on public.content_items (user_id, scheduled_at);
