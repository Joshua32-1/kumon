# Architecture

How the Kumon admin panel fits together. See [DATABASE.md](DATABASE.md) for the schema and [API.md](API.md) for endpoint details.

## Stack

- **Next.js App Router** (TypeScript, React server components) — UI and API in one deployable
- **Supabase** — Postgres + auth (single admin user model)
- **Midtrans Snap** — payment gateway for parent checkout
- **Meta WhatsApp Cloud API** — reminders and payment confirmations via approved named templates
- **Vercel** — hosting + cron scheduler ([vercel.json](vercel.json))

Path alias `@/*` maps to the repo root. Admin UI copy is **Bahasa Indonesia**.

## Request flow

```
Browser ──▶ proxy.ts (middleware: session refresh + login redirect)
              │
              ├─▶ app/(dashboard)/…  server components ──▶ features/*/service.ts ──▶ Supabase (session client)
              │       └─ client components ──▶ features/*/actions.ts (server actions)
              │                                   └─ zod validate ──▶ service ──▶ revalidatePath
              ├─▶ app/api/…           route handlers ──▶ same services
              ├─▶ app/pay/[token]     public — no session
              ├─▶ app/api/webhooks/…  public — signature-verified
              └─▶ app/api/cron/…      public — verifyCronAuth + per-job toggle
```

## Layering contract

| Layer | Location | Rules |
|---|---|---|
| Pages / routes | `app/` | No business logic, no direct DB queries beyond simple reads. Delegate to services. |
| Server actions | `features/*/actions.ts` | `"use server"`. Zod-validate input via the sibling `validations.ts`, call the service, `revalidatePath` every page whose data changed. |
| Services | `features/*/service.ts` | All business logic and DB access. [features/payments/service.ts](features/payments/service.ts) is the core of the system — invoice generation, reminders, reconciliation, status transitions. |
| Infrastructure | `lib/` | Supabase clients, Midtrans client, cron auth/toggles, error types. |
| Pure billing helpers | `lib/billing/` | Fees, historical fee schedule, grades, billing periods, leaves, arrears, revenue chart. No side effects — safe to call anywhere. |

Domain modules: `features/students/`, `features/payments/`, `features/messaging/` — each with `actions.ts`, `service.ts`, `types.ts`, `validations.ts` (where input exists), and `components/`.

## Two Supabase clients

- [lib/supabase/server.ts](lib/supabase/server.ts) — cookie-based user-session client. Use in pages, server actions, and admin API routes. Subject to RLS (policies allow all for `authenticated`).
- [lib/supabase/admin.ts](lib/supabase/admin.ts) — service-role client, lazily initialized, **bypasses RLS**. Use only in cron routes, webhooks, and service code paths that run without a user session. Never import into client components; never let it serve a user-originated request that should be session-scoped.

## Auth boundaries

[proxy.ts](proxy.ts) (Next.js middleware) refreshes the Supabase session and redirects unauthenticated users to `/login`, **exempting**: `/pay/*` (public parent links), `/api/webhooks/*`, `/api/cron/*`, and static assets.

Exempted routes authenticate themselves:

- **Cron/manual** — `verifyCronAuth` in [lib/auth/cron.ts](lib/auth/cron.ts) accepts either `Authorization: Bearer {CRON_SECRET}` (what Vercel Cron sends on GET) or `x-api-key: {WEBHOOK_SECRET}` (manual POST with JSON overrides). `CRON_SECRET` is mandatory in production or all cron jobs 401.
- **Midtrans webhook** — SHA-512 signature verification (`verifyMidtransSignature` in [lib/midtrans/client.ts](lib/midtrans/client.ts)) over order id + status code + gross amount + server key.
- **Pay pages** — the unguessable per-invoice token *is* the auth.

## Billing automation lifecycle

All schedules in [vercel.json](vercel.json) are **UTC; the business runs in WIB (UTC+7)** — `0 0 1 * *` fires the 1st at 07:00 WIB. Every job first checks `verifyCronAuth`, then its enable flag in `system_config.cron_jobs` (toggled from Settings) via [lib/cron/enabled.ts](lib/cron/enabled.ts), returning `{ skipped: true, reason: "cron_disabled" }` when off. All jobs are idempotent — a duplicate firing is a no-op.

Monthly cycle:

1. **`generate-invoices`** (1st, 07:00 WIB) — marks older `PENDING` invoices `OVERDUE`, then creates one invoice per billable student (`ACTIVE`/`TEMPORARY_LEAVE`, skipping leave months, existing invoices, and students with no subjects). Amount = per-subject fees for the student's school level, priced from the **historical fee schedule** for that billing month. Assigns the stable pay token and schedules reminders for the 1st/11th/21st.
2. **`backfill-payment-links`** (daily, 07:30 WIB) — safety net assigning missing `payment_access_token`s before morning reminders.
3. **`send-reminders`** (1st/11th/21st, ten half-hour slots 09:00–13:30 WIB) — up to `WHATSAPP_BATCH_LIMIT` (default 100) sends per slot with `WHATSAPP_SEND_DELAY_MS` (default 2000 ms) between sends. Slots 1–9: current-month reminders only (Phase 1). Slot 10: remainder + overdue/prior-month chase (Phase 2). The slot is inferred from WIB clock time or passed explicitly. Already-`SENT` rows are skipped, so slots dedupe naturally. Constants in [lib/constants.ts](lib/constants.ts).
4. **`reconcile-payments`** (daily, 22:00 WIB) — polls Midtrans for unpaid invoices (6+ hours old) that opened checkout, syncing `PAID` and sending confirmation when the webhook was missed.
5. **`promote-grades`** (June 30 24:00 UTC = July 1 07:00 WIB, yearly) — advances all `ACTIVE`/`TEMPORARY_LEAVE` student grades via the `promote_grades_annual` RPC. Idempotent per year (`already_promoted: true` on re-run); only runs in July WIB unless forced with an explicit `promotionYear`.
6. **`sync-leave-status`** (daily, 00:15 WIB) — enforces the status invariant *`TEMPORARY_LEAVE` iff a `temporary_leaves` row exists for the current WIB month*: marks `ACTIVE` students with a current-month leave, reverts `TEMPORARY_LEAVE` students without one. Never touches `INACTIVE`. Display/KPI hygiene only — billing reads leave rows directly, not the status field.

## Payment link lifecycle

The invariant: **Midtrans is never called during invoice generation or reminder send.**

1. Each invoice gets a stable `payment_access_token` at creation; parents receive `NEXT_PUBLIC_APP_URL/pay/{token}` over WhatsApp.
2. When the parent opens the link, [app/pay/[token]/route.ts](app/pay/[token]/route.ts) → `paymentService.resolvePayPage`: validates the invoice (`PENDING`/`OVERDUE`, active student), reuses a still-pending unexpired Snap session, or **lazily creates** a fresh one (`page_expiry` from `MIDTRANS_PAGE_EXPIRY_HOURS`, retries on 429/5xx) and redirects.
3. Paid status arrives via three redundant paths: the Midtrans **webhook** (primary), the nightly **reconcile** cron, or manual admin **sync** ("Sinkronkan Midtrans").
4. Admin actions: **Batalkan** (cancel + best-effort expire the Snap order), **Hitung ulang tagihan** (recalculate line items, expire old session — same link opens a fresh checkout), **Tandai Lunas** (manual cash override, no auto-confirmation message), **Kirim konfirmasi pembayaran** (explicit confirmation send).
5. **Cuti auto-cancel**: recording cuti for a month with a `PENDING`/`OVERDUE` invoice cancels it through the same cancel path (default-on checkbox in the leave dialogs; the action layer composes `studentService` + `paymentService`). The pay page then shows a cuti-specific "tidak ada tagihan" message instead of the generic cancelled one. `PAID` invoices are never auto-touched — they surface on the dashboard as paid-leave conflicts that persist until an admin clicks "Tandai selesai" (recorded in `paid_leave_conflict_resolutions`) or the cuti is cancelled; refund/credit is a manual decision. **Cancelling a cuti** offers (default-on, current/future months only) to rebill the month — it regenerates the auto-cancelled invoice via `generateMonthly`, so cancelling cuti doesn't silently leave the month unbilled.
6. If a parent pays a stale/cancelled session, the invoice becomes **`PAID_OLD_LINK`** for manual follow-up — never auto-`PAID`, no auto-confirmation.

## Messaging

[features/messaging/service.ts](features/messaging/service.ts) hides the provider behind a `MessagingProvider` interface (`send`, optional `sendTemplate`). The active provider is **Meta WhatsApp Cloud API** posting to `graph.facebook.com/{version}/{phone_number_id}/messages` with approved **named templates** — `kumon_payment_reminder` and `kumon_payment_confirmation`, language `id`. Required template variables (e.g. `nama_orang_tua`, `total_tagihan`, `link_pembayaran`) are documented in [.env.local.example](.env.local.example), which is the source of truth.

Messages always include student name, school level, the subjects billed, and the total so parents can verify enrollment. All sends from app code must go through `messagingService` — never call the Graph API directly.

## Timezone policy

The center operates in WIB (`Asia/Jakarta`); servers run in UTC. Every day/month/year decision must use the helpers in [lib/utils.ts](lib/utils.ts) (`todayInCenterTimezone`, `currentMonthYearInCenterTimezone`, `dayOfMonthFromDateString`, …). Raw `new Date().getMonth()`-style math is a bug: near midnight WIB it lands on the wrong day, which shifts invoices, reminders, and overdue transitions. Remember the −7h offset when editing [vercel.json](vercel.json) schedules.
