---
name: code-review-checklist
description: Repo-specific checklist for reviewing code changes in this Kumon management system. Use when reviewing a diff, PR, or branch, or before committing non-trivial changes — covers billing/timezone invariants, layering rules, and cron/payment pitfalls specific to this codebase.
---

# Code Review Checklist

Work through the sections the diff touches. These are the invariants that are easy to break silently in this codebase — generic review quality (naming, dead code) is assumed.

## Always

- **Type check**: there is no test suite or linter. Run `npx tsc --noEmit` (or `npm run build` for route/RSC validation). A clean build is the only automated gate.
- **Layering**: pages and API routes must not contain business logic or direct DB queries — that belongs in `features/*/service.ts`. Server actions (`features/*/actions.ts`) must zod-validate input via `validations.ts` and call `revalidatePath` for every page whose data they change.
- **Supabase client choice**: `lib/supabase/server.ts` (cookie session) for user-facing paths; `lib/supabase/admin.ts` (service role, bypasses RLS) only in cron routes, webhooks, and service code that runs without a session. Flag any new `supabaseAdmin` usage reachable from a user request.

## Structural changes

If the diff adds a new domain module under `features/`, a new external service/vendor, a new cron job, a new public (middleware-exempt) route, or modifies `proxy.ts` exemptions — review it at architecture level too:

- Does [ARCHITECTURE.md](../../../ARCHITECTURE.md) describe this pattern? If the diff invents a new one (a second messaging provider, a new auth mechanism, a new style of background work), flag it as a **Warning**: architectural decisions need an explicit OK from the user, not silent precedent.
- New public surface: what authenticates it, and what is the blast radius if that secret/token leaks?
- New cron job: what happens if it never runs for a week? If it runs twice in one slot?
- The diff must update ARCHITECTURE.md (and API.md for new endpoints) — drift between the docs and the system is a finding.

## Dates and billing periods

- All day/month/year decisions must use the WIB helpers in `lib/utils.ts` (`todayInCenterTimezone`, `currentMonthYearInCenterTimezone`, etc.). Flag any raw `new Date().getMonth()`/`getDate()` or `toISOString().slice(...)` used for business dates — servers run in UTC, the center runs in WIB (UTC+7).
- Fee lookups for a given invoice month must go through the historical fee schedule (`lib/billing/load-subject-fees.ts`), not the current `subject_fees` config, or regenerating an old month bills the wrong rate.
- Billing-period guards: `lib/billing/billing-period.ts` helpers must be used when deciding whether a student/subject is billable for a month (enrollment date, past periods, leave months).

## Cron routes (`app/api/cron/*`)

- Must call `verifyCronAuth` and check `isCronJobEnabled` before doing work.
- Must be idempotent — every job can fire twice (manual + scheduled). Re-runs must be no-ops (the partial unique invoice index, `already_promoted` for grade promotion, SENT-reminder dedup across slots).
- Schedules in `vercel.json` are **UTC**; intended times are WIB. Verify any schedule change is offset by −7 hours.
- Long-running routes need `maxDuration` exported; batch sizes and delays come from env (`WHATSAPP_BATCH_LIMIT`, `WHATSAPP_SEND_DELAY_MS`), never hardcoded.

## Payments and Midtrans

- **Lazy checkout invariant**: Midtrans Snap sessions are created only when a parent opens `/pay/{token}` — never during invoice generation, reminder send, or backfill. Flag any new Midtrans call outside the pay-link flow, reconcile, webhook, or explicit admin sync/checkout.
- Invoice status transitions are constrained: only `PENDING`/`OVERDUE` are payable; cancel/recalculate must expire the old Midtrans order (best-effort); payments on stale links land in `PAID_OLD_LINK`, never `PAID`. Check new code paths preserve these.
- One active invoice per `student_id + month + year` (partial unique index excludes `CANCELLED`/`PAID_OLD_LINK`). Inserts must handle the conflict, not assume absence.
- `markPaid` (manual cash override) must **not** auto-send a confirmation WhatsApp; webhook/reconcile/sync paths do.

## Messaging

- All sends go through `messagingService` (`features/messaging/service.ts`) — never call the Meta Graph API directly elsewhere. Template variable names must match the approved Meta templates documented in `.env.local.example`.
- Messages to parents are in Bahasa Indonesia and must include student name, school level, subjects, and total, so parents can verify enrollment.

## Schema changes

If the diff touches `supabase/migrations/`, also apply the `supabase-migrations` skill: ordering, idempotency, regenerated `types/database.ts`, README deploy-checklist updates.

## UI

- Admin UI copy is Bahasa Indonesia; new user-facing strings in English are a bug.
- Status badges/filters must cover all enum values — adding a `payment_status` or `reminder_status` value requires updating `PaymentStatusBadge`, the Pembayaran page filters, and dashboard panels.
