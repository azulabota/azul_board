# Sapien Eleven Project Dashboard

A project management dashboard for Sapien Eleven.

## Features

- **Tasks** - Create, track, and manage project tasks
- **Milestones** - Set project milestones with progress tracking
- **Files** - Upload and share project files
- **Team** - Invite team members with different roles

## Tech Stack

- Next.js 14
- Supabase (Auth + Database + Storage)
- Vercel (Deployment)

## Setup Instructions

### 1. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor in your Supabase dashboard
3. Copy and paste the contents of `supabase-schema.sql` and run it
3. Go to Settings → API
4. Copy the `Project URL` and `anon public` key

### 2. Environment Variables

Create a `.env.local` file:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Deploy to Vercel

1. Push this code to a GitHub repository
2. Go to [vercel.com](https://vercel.com)
3. Import the repository
4. Add the environment variables in Vercel settings
5. Deploy!

### 4. Local Development

```bash
cd sapien-dashboard
npm install
npm run dev
```

## Usage

1. Sign up for an account
2. Add tasks and milestones
3. Invite team members
4. Upload project files
5. Track progress

## License

MIT
