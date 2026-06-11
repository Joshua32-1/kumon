---
name: feature-testing
description: Testing playbook for verifying features and workflows in this repo end-to-end (there is no test suite). Use when asked to test a change, verify a feature or cron job works, hunt for edge-case errors, or confirm a fix — includes manual trigger recipes and the per-domain edge-case checklist.
---

# Feature Testing

There is no automated test suite. Verification means: pass the static gates, exercise the real workflow, check the edge cases, and fix what breaks. Endpoint details and override bodies: [API.md](../../../API.md).

## Baseline gates (always, first)

```bash
npx tsc --noEmit     # type check
npm run build        # catches route/RSC/build-time errors tsc misses
npm run dev          # boot clean, no startup errors in console
```

## Workflow recipes

All cron routes accept GET + `Authorization: Bearer $CRON_SECRET` or POST + `x-api-key: $WEBHOOK_SECRET` with a JSON body (secrets are in `.env.local`). Every route first checks its toggle in `system_config.cron_jobs` — if you get `{skipped: true, reason: "cron_disabled"}`, enable it in Settings (Pengaturan) or directly in the table.

**Invoice generation** — generate for a target month, then verify:

```bash
curl -X POST http://localhost:3000/api/cron/generate-invoices \
  -H "x-api-key: $WEBHOOK_SECRET" -H "Content-Type: application/json" \
  -d '{"month": 6, "year": 2026}'
```

Expect `generated` count = billable students (ACTIVE/TEMPORARY_LEAVE, minus leave months, minus existing invoices, minus zero-subject students); older PENDING invoices flipped to OVERDUE; reminders scheduled for the 1st/11th/21st; each invoice has a `payment_access_token`.

**Reminders** — `{"slot": 1}` sends Phase 1 (current month) up to `WHATSAPP_BATCH_LIMIT`; `{"slot": 10}` adds the Phase 2 overdue chase. Re-run the same slot: already-SENT rows must be skipped (sent count 0 the second time).

**Pay link** — open `http://localhost:3000/pay/{token}` in a browser: unpaid invoice redirects to Midtrans Snap (sandbox when `MIDTRANS_IS_PRODUCTION=false`); paid/cancelled invoices show an Indonesian HTML message page instead.

**Reconcile / promote / backfill** — see API.md for bodies (`promote-grades` off-season needs `{"force": true, "promotionYear": <year>}`).

**Admin flows** — through the UI or `app/api` routes: generate (Pembayaran page), Batalkan, Hitung ulang tagihan, Tandai Lunas, Sinkronkan Midtrans. After each server action, the affected page must show fresh data (revalidatePath working).

## Edge-case checklist

Test the ones adjacent to the change:

- **Idempotency**: run every touched cron twice with identical input — second run must be a no-op (no duplicate invoices/reminders/sends; `already_promoted: true` for grades).
- **Date boundaries**: behavior near month rollover — WIB is UTC+7, so 17:00–24:00 UTC is *tomorrow* in WIB. Pass explicit `month`/`year`/`date` overrides to simulate.
- **Leave interactions**: student with a `temporary_leaves` row for the month is skipped at generation; setting leave on a month with an existing unpaid invoice shows the LeaveDialog warning (no auto-cancel).
- **Enrollment edges**: student enrolled mid-year (no invoices before `enrolled_at`), student with zero subjects (skipped), TEMPORARY_LEAVE student (still billed in non-leave months).
- **Duplicate invoice**: generating when an active invoice exists must not violate `invoices_student_month_year_active_idx` — it should skip, not crash.
- **Stale pay link**: cancel/recalculate an invoice, then pay the old Snap session (sandbox) → invoice becomes `PAID_OLD_LINK`, never `PAID`, no auto-confirmation.
- **Missed webhook**: mark a Midtrans sandbox payment settled without the webhook firing → reconcile run picks it up and sends the confirmation.
- **Grade promotion**: SMA_3 stays SMA_3; INACTIVE students untouched; `school_level` flips when crossing SD 6 → SMP 1.
- **Manual paid**: Tandai Lunas must not send a WhatsApp; Sinkronkan Midtrans on a settled payment must.

## When an error surfaces

1. Capture the exact output (response JSON, server console, browser).
2. Locate the owning service — business logic lives in `features/*/service.ts` (payments core: `features/payments/service.ts`), pure helpers in `lib/billing/`.
3. Fix at the service/helper layer, not by patching the route.
4. Re-run the **same recipe** that surfaced the error, plus the idempotency re-run, plus `npx tsc --noEmit`.
5. If the fix touched review-sensitive areas (dates, status transitions, cron), run the `code-review-checklist` skill over the diff.
