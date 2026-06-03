# Kumon Management System

Admin panel for managing students, monthly payments, WhatsApp reminders, and Midtrans payment links at a Kumon center.

## Stack

- **Next.js 15** (App Router, TypeScript)
- **Supabase** — database, auth, realtime
- **Midtrans Snap** — payment gateway
- **Fonnte / WhatsApp Business API** — messaging
- **shadcn/ui** (base-nova) + Tailwind CSS

## Setup

### 1. Supabase project

1. Create a new project at [supabase.com](https://supabase.com).
2. Run the migration:
   ```
   npx supabase db push
   ```
   or copy `supabase/migrations/0001_initial_schema.sql` into the Supabase SQL editor and run it.
3. In the Supabase dashboard, create an admin user under **Authentication → Users**.
4. Generate types after schema is live:
   ```
   npx supabase gen types typescript --project-id <your-project-id> > types/database.ts
   ```

### 2. Environment variables

```bash
cp .env.local.example .env.local
```

Fill in all values:

| Variable | Where to find |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (service role) |
| `MIDTRANS_SERVER_KEY` | Midtrans dashboard → Settings → Access Keys |
| `MIDTRANS_CLIENT_KEY` | Midtrans dashboard → Settings → Access Keys |
| `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` | Same as `MIDTRANS_CLIENT_KEY` |
| `MIDTRANS_IS_PRODUCTION` | `false` for sandbox, `true` for production |
| `WHATSAPP_PROVIDER` | `fonnte` (default) |
| `WHATSAPP_API_KEY` | Your Fonnte API key |
| `WHATSAPP_API_URL` | `https://api.fonnte.com/send` |
| `NEXT_PUBLIC_APP_URL` | App's public URL |
| `WEBHOOK_SECRET` | Secret for cron API calls (`x-api-key` header) |
| `CRON_SECRET` | Optional — Vercel Cron bearer token |

### 3. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with the admin user created in Supabase.

## Monthly billing automation

Invoice generation and WhatsApp reminders run via cron API routes, scheduled by **Vercel Cron** (`vercel.json`).

### What runs automatically

| Schedule (WIB) | Endpoint | What it does |
|---|---|---|
| 1st, 07:00 | `POST /api/cron/generate-invoices` | Creates one invoice per active student for the current month (skips students on leave or with an existing invoice). Creates Midtrans payment links. Schedules reminders for the 1st, 11th, and 21st. |
| 1st, 11th, 21st — 09:00 | `POST /api/cron/send-reminders` | Sends WhatsApp reminders with the Midtrans payment link to parents of active students with unpaid invoices. |

Each student gets **at most one invoice per month** (enforced by a database unique constraint on `student_id + month + year`).

### Auth

Cron routes accept either:
- `x-api-key: {WEBHOOK_SECRET}` (for manual or external scheduler calls)
- `Authorization: Bearer {CRON_SECRET}` (for Vercel Cron)

### Manual trigger (testing)

```bash
# Generate invoices for the current month (WIB)
curl -X POST http://localhost:3000/api/cron/generate-invoices \
  -H "x-api-key: YOUR_WEBHOOK_SECRET"

# Send due reminders for today
curl -X POST http://localhost:3000/api/cron/send-reminders \
  -H "x-api-key: YOUR_WEBHOOK_SECRET"
```

## Deployment

Deploy to Vercel. Set all environment variables in the Vercel project settings. Vercel Cron runs automatically from `vercel.json` when deployed.

```bash
vercel --prod
```
