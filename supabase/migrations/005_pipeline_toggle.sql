-- 005_pipeline_toggle.sql

alter table public.content_pipelines
  add column if not exists is_enabled boolean not null default true;

-- RLS already enabled. Ensure users can update their own pipelines (policy exists). No changes needed.
