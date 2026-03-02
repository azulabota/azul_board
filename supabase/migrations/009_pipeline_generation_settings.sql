-- 009_pipeline_generation_settings.sql
-- Adds generation guidance fields to content_pipelines

do $$ begin
  alter table public.content_pipelines
    add column if not exists gen_length text not null default 'short',
    add column if not exists gen_min_words int,
    add column if not exists gen_max_words int,
    add column if not exists gen_must_start_with text,
    add column if not exists gen_must_end_question boolean not null default false,
    add column if not exists gen_include_cta boolean not null default true,
    add column if not exists gen_no_hashtags boolean not null default true,
    add column if not exists gen_no_emojis boolean not null default true;
exception when others then
  -- ignore
end $$;

-- Ensure allowed values for gen_length
-- Postgres doesn't support add constraint if not exists; do guarded add.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_pipelines_gen_length_check'
      and conrelid = 'public.content_pipelines'::regclass
  ) then
    alter table public.content_pipelines
      add constraint content_pipelines_gen_length_check
      check (gen_length in ('short','medium','long','thread'));
  end if;
end $$;
