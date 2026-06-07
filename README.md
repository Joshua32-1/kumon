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
2. Run migrations **in order** (SQL editor or `npx supabase db push`):
   - `supabase/migrations/0001_initial_schema.sql`
   - `supabase/migrations/0002_functions.sql`
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
| `MIDTRANS_IS_PRODUCTION` | `false` for sandbox, `true` for production |
| `WHATSAPP_PROVIDER` | `fonnte` (default) |
| `WHATSAPP_API_KEY` | Your Fonnte API key |
| `WHATSAPP_API_URL` | `https://api.fonnte.com/send` |
| `WHATSAPP_SEND_DELAY_MS` | Optional — ms between WhatsApp sends in cron (default `2000`) |
| `WHATSAPP_BATCH_LIMIT` | Optional — max sends per reminder slot (default `100`) |
| `WEBHOOK_SECRET` | Secret for manual/local cron calls (`x-api-key` header on POST) |
| `CRON_SECRET` | **Required on Vercel** — Vercel Cron sends `Authorization: Bearer {CRON_SECRET}` on GET |

### Subject fees (seeded in migration)

Per-subject billing: English / Bahasa Indonesia / Matematika, with school-level tiers (TK/SD vs SMP/SMA) and invoice line items on each tagihan. WhatsApp reminders and confirmations list each subject and the total.

Default fees: **TK/SD Rp 480,000** per subject, **SMP/SMA Rp 530,000** per subject. Adjust in **Pengaturan** after first login.

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
| 1 Jul, 00:00 | `GET /api/cron/promote-grades` | Promotes grade for all **ACTIVE** and **TEMPORARY_LEAVE** students (TK 1→TK 2→…→SD 6→SMP 1→…→SMA 3; SMA 3 unchanged). Updates billing tier (TK/SD vs SMP/SMA) from grade. Skips **INACTIVE** only. **Idempotent per year** — a second run for the same promotion year is a no-op (`already_promoted: true`). Only allowed in July (WIB) unless overridden for testing. |
| 1st, 07:00 | `GET /api/cron/generate-invoices` | Marks all older unpaid (`PENDING`) invoices as `OVERDUE`, then creates one invoice per **ACTIVE** or **TEMPORARY_LEAVE** student for the current month (skips students with a `temporary_leaves` row for that month, with an existing non-cancelled invoice, or with no subjects enrolled). Amount = sum of per-subject fees for that student's school level. Creates Midtrans payment links (500ms delay between calls, exponential backoff on 429/5xx). Schedules reminders for the 1st, 11th, and 21st. |
| Daily, 07:30 | `GET /api/cron/backfill-payment-links` | Retries Midtrans link creation for up to 50 unpaid (`PENDING`/`OVERDUE`) invoices missing a payment URL (oldest first). Catches rate-limit failures from invoice generation before morning reminders. |
| 1st, 11th, 21st — 09:00 WIB (slot 1) | `GET /api/cron/send-reminders` | **Slot 1** of 4. Sends up to 100 current-month scheduled reminders (Phase 1). 2s delay between sends. |
| 1st, 11th, 21st — 09:30 WIB (slot 2) | `GET /api/cron/send-reminders` | **Slot 2**. Continues Phase 1 remainder (up to 100). |
| 1st, 11th, 21st — 10:00 WIB (slot 3) | `GET /api/cron/send-reminders` | **Slot 3**. Phase 1 remainder + starts **Phase 2** (OVERDUE/prior-month chase). Up to 100 each. |
| 1st, 11th, 21st — 10:30 WIB (slot 4) | `GET /api/cron/send-reminders` | **Slot 4**. Phase 2 overdue backlog. Total morning capacity: ~400 sends. |
| Daily, 22:00 | `GET /api/cron/reconcile-payments` | Polls Midtrans for unpaid invoices (6+ hours old) with a payment link. Syncs `PAID` status and sends confirmation WhatsApp when Midtrans shows settlement but the webhook was missed. |

Each student gets **at most one active invoice per month** (unique on `student_id + month + year` where status is not `CANCELLED` or `PAID_OLD_LINK`).

When a new month's invoices are generated, any invoice for an **earlier** month still in `PENDING` is automatically set to `OVERDUE` (including students on leave who did not receive a new invoice).

WhatsApp reminders and payment confirmations include the student's name, school level (TK/SD vs SMP/SMA), and the subjects billed on that invoice so parents can verify enrollment.

### Auth

**Vercel Cron (production):** routes are invoked with **GET** and `Authorization: Bearer {CRON_SECRET}`. `CRON_SECRET` is required on Vercel — without it, cron jobs return 401. Set it in Vercel → Project → Settings → Environment Variables (Production, and Preview if crons run there).

**Manual / local debugging:** routes also accept **POST** with:
- `x-api-key: {WEBHOOK_SECRET}` — supports optional JSON body for overrides (month, slot, `force`, etc.)
- `Authorization: Bearer {CRON_SECRET}` — same auth as Vercel Cron, on GET or POST

### Manual trigger (testing)

**Simulate Vercel Cron** (GET + bearer — matches production):

```bash
# Generate invoices for the current month (WIB)
curl http://localhost:3000/api/cron/generate-invoices \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Send due reminders (default slot 1)
curl http://localhost:3000/api/cron/send-reminders \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Promote grades (July only in WIB)
curl http://localhost:3000/api/cron/promote-grades \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Reconcile unpaid invoices against Midtrans
curl http://localhost:3000/api/cron/reconcile-payments \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Backfill missing Midtrans payment links
curl http://localhost:3000/api/cron/backfill-payment-links \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Manual overrides** (POST + `x-api-key` — JSON body for parameters):

```bash
# Generate invoices for a specific month
curl -X POST http://localhost:3000/api/cron/generate-invoices \
  -H "x-api-key: YOUR_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"month": 6, "year": 2026}'

# Send due reminders — slot 1 (Phase 1 only, up to 100)
curl -X POST http://localhost:3000/api/cron/send-reminders \
  -H "x-api-key: YOUR_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"slot": 1}'

# Send due reminders — slot 3 (Phase 1 + Phase 2 overdue chase)
curl -X POST http://localhost:3000/api/cron/send-reminders \
  -H "x-api-key: YOUR_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"slot": 3}'

# Promote grades off-season (dev only — requires explicit promotionYear)
curl -X POST http://localhost:3000/api/cron/promote-grades \
  -H "x-api-key: YOUR_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"force": true, "promotionYear": 2099}'

# Reconcile unpaid invoices against Midtrans
curl -X POST http://localhost:3000/api/cron/reconcile-payments \
  -H "x-api-key: YOUR_WEBHOOK_SECRET"

# Backfill missing payment links for a specific month
curl -X POST http://localhost:3000/api/cron/backfill-payment-links \
  -H "x-api-key: YOUR_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"month": 6, "year": 2026, "batch_limit": 100}'
```

### Midtrans link rate limiting

Bulk invoice generation creates Snap payment links sequentially. To avoid Midtrans throttling:

| Env var | Default | Meaning |
|---------|---------|---------|
| `MIDTRANS_LINK_DELAY_MS` | `500` | Milliseconds between link-creation calls |
| `MIDTRANS_RETRY_ATTEMPTS` | `4` | Max attempts per Snap call (exponential backoff) |
| `MIDTRANS_RETRY_BASE_DELAY_MS` | `2000` | Base delay before first retry on 429/5xx |
| `MIDTRANS_BACKFILL_BATCH_LIMIT` | `50` | Invoices processed per backfill cron run |

If some links still fail, the daily backfill cron retries them before morning WhatsApp reminders. Reminder sends also call `ensureCheckoutLink` as a last resort.

### WhatsApp send rate limiting

For centers with 200+ students, the send-reminders cron uses a **four-slot morning schedule** to stay within Fonnte limits and Vercel function timeouts.

| Env var | Default | Meaning |
|---------|---------|---------|
| `WHATSAPP_SEND_DELAY_MS` | `2000` | Milliseconds to wait between sends within a slot |
| `WHATSAPP_BATCH_LIMIT` | `100` | Maximum send attempts per cron invocation (slot) |

Long-running cron routes set `maxDuration` (requires **Vercel Pro** — Hobby caps at ~10s):

| Route | `maxDuration` | Why |
|-------|---------------|-----|
| `send-reminders` | 300 | 100 sends × 2s delay ≈ 3.3 min per slot |
| `generate-invoices` | 300 | Sequential Midtrans Snap link per billable student |
| `reconcile-payments` | 120 | Sequential Midtrans status check per pending invoice |

**Vercel Hobby** cannot run reminder or invoice-generation workloads at scale — functions time out after ~10s. Use **Vercel Pro** (for `maxDuration` up to 300s) or an **external cron** (e.g. GitHub Actions, cron-job.org) that calls the same GET endpoints with `Authorization: Bearer {CRON_SECRET}`.

Slots 1–2 send only current-month reminders (Phase 1). Slots 3–4 also send overdue/prior-month chase messages (Phase 2). Deduplication is automatic — already-SENT rows are skipped by subsequent slots.

### Attention and arrears tracking

The admin UI distinguishes two attention types:
- **Perlu tindakan (WA)** — delivery problem: link missing, not sent, or WA failed. Fix by sending or regenerating.
- **Tunggakan** — collection problem: invoice is OVERDUE or past due_date but WA was sent. Follow up if needed.

The dashboard Tunggakan panel shows unpaid invoices grouped by month with Rp totals and deep links. The Pembayaran page has a "Semua tunggakan" view that shows all arrears across months sorted oldest first.

When setting leave for a month that has an existing unpaid invoice, the LeaveDialog shows a warning and a link to the invoice. No auto-waive/cancel — admin handles it manually.

### Consecutive leave review

Settings → **Maks. Bulan Cuti Berturut-turut** (default 3) counts **adjacent calendar months** with a `temporary_leaves` row, not total months on leave. When a **TEMPORARY_LEAVE** student’s current streak (ending at their latest leave month) reaches that limit, the dashboard, student list, and student profile show an amber alert so admins can decide whether to deactivate. Nothing is auto-deactivated.

### Grades and invoice admin actions

- Students have structured grades (TK 1–2, SD 1–6, SMP 1–3, SMA 1–3). Billing tier (TK/SD vs SMP/SMA) is derived from grade.
- **Batalkan** — cancels an unpaid invoice and expires the Midtrans link (best-effort).
- **Hitung ulang tagihan** — recalculates line items from current enrollment, expires the old link, creates a new one (status stays PENDING/OVERDUE).
- **Sinkronkan Midtrans** — checks Midtrans for a successful payment and updates the invoice (use when the webhook was missed). Sends confirmation WhatsApp on normal `PAID` sync.
- **Tandai Lunas** — manual override for cash/bank transfer (no Midtrans order to verify). Does not auto-send confirmation WhatsApp; use **Kirim konfirmasi pembayaran** after.
- If a parent pays a **stale** link after cancel/waive/regenerate, the invoice becomes **Lunas (link lama)** (`PAID_OLD_LINK`) for admin follow-up (no auto confirmation WhatsApp).

## Deployment

Deploy to Vercel. Set all environment variables in the Vercel project settings — **`CRON_SECRET` is required** for scheduled jobs to authenticate. Vercel Cron runs automatically from `vercel.json` when deployed.

### Deploy checklist

Apply database migrations **before** (or at the same time as) deploying app code.

- **`0001`** creates the full schema (enums, tables, RLS, config seeds). Includes `PAID_OLD_LINK`, `reminder_status.CANCELLED`, subject billing, and the partial unique index on invoices.
- **`0002`** adds the idempotent `promote_grades_annual` RPC used by the July grade-promotion cron. Without it, `/api/cron/promote-grades` fails at runtime.

1. **Apply migrations** (Supabase SQL editor or `npx supabase db push`) through `0002`.
2. **Verify enums** — in the Supabase SQL editor:

   ```sql
   SELECT e.enumlabel
   FROM pg_enum e
   JOIN pg_type t ON e.enumtypid = t.oid
   WHERE t.typname IN ('payment_status', 'reminder_status')
   ORDER BY t.typname, e.enumsortorder;
   ```

   Expected `payment_status` labels include `PAID_OLD_LINK`. Expected `reminder_status` labels include `CANCELLED`.

3. **Verify grade promotion RPC** — confirm the function exists:

   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'promote_grades_annual';
   ```

4. **Deploy app**:

   ```bash
   vercel --prod
   ```

5. **Smoke test** — open Dashboard → "Pembayaran Link Lama" card loads; Payments page filter "Lunas (link lama)" works.

**Rollback note:** Keep app deploys paired with the schema. Rolling back app code without rolling back the database can leave rows or enum values the old app does not understand.
