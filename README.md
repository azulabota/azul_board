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
5. In Settings -> API, copy:
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

### 5. Notes for admin flow

- New signups are created with `profiles.status = 'pending'`.
- A trigger auto-creates `profiles`, `user_permissions`, and default `user` role.
- Admins approve/disable users and manage permissions/roles from `/admin`.
- Pending users are redirected to `/pending`.

## Build check

```bash
npm run build
```
