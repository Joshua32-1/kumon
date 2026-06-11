---
name: production-readiness
description: Pre-deploy audit for this repo — environment variables, migration/deploy ordering, security checks, and post-deploy smoke test. Use before deploying to Vercel, when asked "is this ready for production", or when diagnosing production-only failures (cron 401s, missing RPCs, template errors).
---

# Production Readiness

Run this audit before every production deploy. Smoke/workflow recipes live in the `feature-testing` skill; endpoint details in [API.md](../../../API.md).

## 1. Environment variables (Vercel → Project → Settings)

Every key in `.env.local.example` must be set for Production (and Preview if crons run there):

| Check | Failure mode if wrong |
|---|---|
| `CRON_SECRET` set and non-empty | **All five cron jobs return 401** — invoices/reminders silently stop |
| `WEBHOOK_SECRET` set | Manual cron triggers impossible |
| `NEXT_PUBLIC_APP_URL` = real production URL | WhatsApp pay links point to localhost/staging |
| `MIDTRANS_IS_PRODUCTION=true` + production server/client keys | Parents land on sandbox checkout |
| `MIDTRANS_SERVER_KEY` matches the dashboard sending webhooks | Webhook signature verification rejects every notification |
| `META_ACCESS_TOKEN` is a **permanent** token; `META_PHONE_NUMBER_ID` correct | Sends fail after token expiry |
| `META_TEMPLATE_*_NAME`/`_LANGUAGE` exactly match templates **approved on that phone number's WABA** | Meta error `(#132001)` on every send |
| `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_*` from the production project | Cron writes go to the wrong project or fail |
| `WHATSAPP_BATCH_LIMIT`/`WHATSAPP_SEND_DELAY_MS` sized for the student count | Slots overrun `maxDuration` or breach rate limits |

Also confirm the Midtrans dashboard webhook/notification URL points at `{NEXT_PUBLIC_APP_URL}/api/webhooks/midtrans`.

## 2. Database / deploy ordering

- All migrations in `supabase/migrations/` applied **in order, before or with** the app deploy. Cron routes fail unattended at runtime if an RPC/column is missing.
- Run the README "Deploy checklist" verification queries: `payment_status` includes `PAID_OLD_LINK`, `reminder_status` includes `CANCELLED`, `promote_grades_annual` exists.
- `types/database.ts` regenerated against the production schema (no drift).
- `system_config` seeds present: `cron_jobs` (all five toggles), `subject_fees`, `subject_fees_schedule` — and toggles are **enabled** for jobs that should run.
- Rollback awareness: new enum values and dropped columns are **one-way**. If this deploy adds either, note that rolling back app code alone can leave data the old app does not understand.

## 3. Platform

- **Vercel Pro required**: `send-reminders` exports `maxDuration: 300`, `generate-invoices`/`reconcile-payments` 120 — Hobby caps at ~10s and the workloads time out. Alternative: external cron (GitHub Actions, cron-job.org) hitting the GET endpoints with the bearer secret.
- `vercel.json` cron schedules are **UTC** (WIB − 7h) — verify any edits against the intended WIB times in API.md.

## 4. Security

- Service-role key only in server-side code (`lib/supabase/admin.ts`); never in client components or `NEXT_PUBLIC_*` vars.
- No new `supabaseAdmin` usage reachable from a user-originated request that should be session-scoped.
- Midtrans webhook still verifies `signature_key` before processing; cron routes still call `verifyCronAuth` before any work.
- New tables have RLS enabled with the `admin_all` policy (see DATABASE.md).
- Middleware exemptions in `proxy.ts` unchanged (only `/pay/*`, `/api/webhooks/*`, `/api/cron/*`, static) — nothing else leaks past the login redirect.
- Secrets are not logged (check new `console.log`/error paths in the diff).

## 5. Post-deploy smoke test

1. Log in; dashboard loads (KPIs, Tunggakan panel, "Pembayaran Link Lama" card).
2. Pembayaran page: filters work, including "Lunas (link lama)".
3. Open one real `/pay/{token}` for an unpaid invoice → redirects to a **production** Midtrans page.
4. Trigger one harmless cron manually with the production secret, e.g. `curl https://<app>/api/cron/backfill-payment-links -H "Authorization: Bearer $CRON_SECRET"` → 200 envelope, not 401.
5. Send one test WhatsApp (Kirim konfirmasi pembayaran on a test invoice or a real reminder) → delivered, template renders with variables filled.
