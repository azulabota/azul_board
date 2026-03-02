# Sapien Eleven Project Dashboard

A Next.js 14 dashboard powered by Supabase.

## Features

- Auth with admin-approved signup flow
- Role-based access control (admin/user)
- Per-user permissions for dev dashboard and content scheduler
- Per-user content calendar with RLS
- Admin panel for approvals, permission toggles, and role management

## Tech Stack

- Next.js 14 (App Router)
- Supabase (Auth + Postgres + Storage)
- TypeScript

## Setup

### 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open SQL Editor.
3. Run `supabase-schema.sql`.
4. Run migration: `supabase/migrations/001_rbac_calendar.sql`.
5. Run migration: `supabase/migrations/002_api_keys_and_dev_policies.sql`.
6. Run migration: `supabase/migrations/008_generation_jobs.sql`.
6. In Settings -> API, copy:
- Project URL
- `anon` public key
- `service_role` secret key

### 2. Environment variables

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 3. Local development

```bash
npm install
npm run dev
```

### 4. Bootstrap your first admin

Because signups start as `pending`, you’ll need to manually promote your first account to admin once you sign up.

In Supabase **SQL Editor** (replace `<YOUR_USER_ID>`):

```sql
update public.profiles set status = 'active' where id = '<YOUR_USER_ID>';
insert into public.user_roles (user_id, role) values ('<YOUR_USER_ID>', 'admin') on conflict do nothing;
update public.user_permissions set can_use_dev_dashboard = true, can_use_scheduler = true where user_id = '<YOUR_USER_ID>';
```

After that, log in and visit `/admin`.

### Coding Cockpit

#### Supabase setup
- Run migration: `supabase/migrations/006_coding_cockpit.sql`
- Run migration: `supabase/migrations/010_cockpit_jobs.sql`
- Run migration: `supabase/migrations/011_cockpit_threads_members.sql`
- Create a **private** Supabase Storage bucket named: `cockpit`
  - Uploads are stored under `<userId>/<threadId>/...`

#### Vercel env vars
- `DASHBOARD_ENCRYPTION_KEY` (required for storing bot tokens / provider keys encrypted-at-rest)
  - Format: either **64 hex chars** (32 bytes) or **base64 of 32 bytes**
  - Example (generate 64-hex): `openssl rand -hex 32`

#### Upload retention
- Attachments are marked with `expires_at = now + 30 days`.
- Archived threads are hidden by default in UI and set to auto-delete after 14 days.
- Run cleanup script periodically (cron/launchd/GitHub Action):

```bash
npm run cockpit:cleanup
```

- Required env vars for cleanup: `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY`.

### Async generation worker (Mac mini)

Pipeline generation now uses a Supabase-backed queue (`public.generation_jobs`) and a local worker process. No inbound tunnel is required.

1. Ensure migration `supabase/migrations/008_generation_jobs.sql` is applied.
2. On the Mac mini, set env vars:

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
MODEL_PROVIDER=stub # or openai
OPENAI_API_KEY=...   # optional for future OpenAI integration
```

3. Run the worker:

```bash
npx tsx scripts/generation-worker.ts
```

The worker polls queued jobs, writes draft `content_items`, and marks each job `done` or `failed`.

### 5. Notes for admin flow

- New signups are created with `profiles.status = 'pending'`.
- A trigger auto-creates `profiles`, `user_permissions`, and default `user` role.
- Admins approve/disable users and manage permissions/roles from `/admin`.
- Pending users are redirected to `/pending`.

## OpenClaw API keys

- Users can manage keys at `/settings`.
- Keys are returned in plaintext only once at creation time and are never stored in plaintext.
- Bot requests must send the key as a bearer token:

```bash
Authorization: Bearer <openclaw_api_key>
```

- Endpoints:
- `POST /api/openclaw/content-items` (requires active user + `can_use_scheduler`)
- `POST /api/openclaw/revisions` (requires active user + `can_use_dev_dashboard`)

## Build check

```bash
npm run build
```
