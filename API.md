# API Reference

All HTTP endpoints, grouped by auth class. See [ARCHITECTURE.md](ARCHITECTURE.md) for how auth boundaries work.

**Response envelope** (every `app/api/*` route, via `apiSuccess`/`apiError` in [lib/utils.ts](lib/utils.ts)):

```jsonc
{ "data": <payload>, "error": null }                          // success
{ "data": null, "error": { "code": "…", "message": "…" } }    // failure (HTTP status matches)
```

Common error codes: `VALIDATION_ERROR` (422, message contains flattened zod errors), `UNAUTHORIZED` (401), `INTERNAL_ERROR` (500), plus domain codes from [lib/errors.ts](lib/errors.ts).

Note: the dashboard UI mostly mutates through **server actions** (`features/*/actions.ts`), not these routes. The admin API routes mirror the same services for programmatic access.

## Admin routes (session cookie via middleware)

Unauthenticated requests are redirected to `/login` by [proxy.ts](proxy.ts).

### Students

| Method & path | Purpose | Input |
|---|---|---|
| `GET /api/students` | List students | Query: `status` (`ACTIVE`\|`TEMPORARY_LEAVE`\|`INACTIVE`), `search` |
| `POST /api/students` | Create student (+ primary contact, subjects) | Body: `createStudentSchema` ([features/students/validations.ts](features/students/validations.ts)) → 201 |
| `GET /api/students/{id}` | Student detail | |
| `PATCH /api/students/{id}` | Polymorphic update — body shape selects the operation | `{subjects: …}` → update enrollment · `{contact: …}` → update primary contact · otherwise `updateStudentSchema` → update student fields |
| `DELETE /api/students/{id}` | **Deactivate** (soft — sets `INACTIVE`), not a hard delete | |
| `POST /api/students/{id}/leave` | Set a temporary-leave month; cancels that month's unpaid invoice unless `cancel_unpaid_invoices: false` | Body: `{month, year, reason?, cancel_unpaid_invoices? = true}` → 201 `{leave, cancelled_invoices, failed_invoices, cancel_error}` (leave is the source of truth: invoice-cancellation failure sets `cancel_error: true`, not an error status) |
| `DELETE /api/students/{id}/leave/{leaveId}` | Cancel a leave month; pass `?regenerate_invoice=true` to rebill the month (current/future only) | → `{leaveId, month, year, regenerated_invoice_id, regenerate_skipped_reason, regenerate_error}` |
| `GET /api/students/billing` | Invoice-first map `studentId → {invoice, reminders, summary, onLeave}` for a billing month | Query: `month`, `year` (default: current WIB month) |
| `GET /api/students/leave-review` | Students whose consecutive-leave streak hit the `max_leave_months` threshold | |

### Payments

| Method & path | Purpose | Input |
|---|---|---|
| `GET /api/payments` | List invoices | Query: `status`, `month`, `year`, `student_id` |
| `POST /api/payments/generate` | Generate monthly invoices (admin-triggered equivalent of the cron) | Body: `generateMonthlySchema` ([features/payments/validations.ts](features/payments/validations.ts)) → 201 |
| `GET /api/payments/{id}` | Invoice detail | |
| `PATCH /api/payments/{id}` | Status transition | Body `{status, notes?}` — `PAID` → `markPaid` (manual override, no auto WhatsApp) · `WAIVED` → `waive` · `CANCELLED` → `cancel` (expires Midtrans session). Anything else → `INVALID_STATUS` |
| `POST /api/payments/{id}/checkout` | Force-create a Midtrans checkout for an invoice (admin-side) | |

### Settings & dashboard

| Method & path | Purpose | Input |
|---|---|---|
| `GET /api/settings` | All `system_config` rows | |
| `PATCH /api/settings` | Upsert config rows | Body: `{updates: [{key, value}]}`. Saving `subject_fees` also appends to the historical `subject_fees_schedule` |
| `GET /api/dashboard/revenue` | Paid-invoice revenue chart summary | Query: `period` (validated by `isRevenueChartPeriod`, default `1_year`) |

### Reports (`/api/reports/*`)

Session-guarded, read-only. Aggregation is pure (`lib/reports/`); routes read via `features/reports/service.ts` (cookie-session client) and return the `{data, error}` envelope.

| Method & path | Purpose | Input |
|---|---|---|
| `GET /api/reports/collection-rate` | Collection rate per month (`paid ÷ billed`; billed excludes CANCELLED/WAIVED, PAID_OLD_LINK counts as paid). Returns `{period, billed, paid, rate, points[]}` (`rate` is `null` when billed is 0). | Query: `period` (validated by `isRevenueChartPeriod`, default `1_year`) |
| `GET /api/reports/arrears-aging` | Outstanding PENDING/OVERDUE invoices bucketed by WIB days past due (0–30 / 31–60 / 61–90 / 90+). Returns `{buckets[], count, totalAmount}`. | — |
| `GET /api/reports/enrollment` | New vs. deactivated students per month (`deactivated_at` bucketed by **WIB** month). Returns `{period, joined, churned, net, points[]}`. | Query: `period` (validated by `isRevenueChartPeriod`, default `1_year`) |
| `GET /api/reports/payment-ledger` | Year-scoped invoice ledger (month, year, student, status, amount, paid_at), sorted by month then student. Returns a `PaymentLedgerRow[]`. | Query: `year` (default current WIB year), optional `status` (a `payment_status`) |
| `GET /api/reports/export` | Same data as the ledger, returned as a **raw `text/csv`** download (RFC-4180 escaped) — `Content-Disposition: attachment; filename="pembayaran-<year>[-<status>].csv"`. Not the `{data,error}` envelope. | Query: `year`, optional `status` |

```bash
# Collection rate for the last year (send your dashboard session cookie)
curl -s "$APP_URL/api/reports/collection-rate?period=1_year" -H "Cookie: $SESSION"
# Arrears aging snapshot
curl -s "$APP_URL/api/reports/arrears-aging" -H "Cookie: $SESSION"
# Enrollment vs. churn
curl -s "$APP_URL/api/reports/enrollment?period=1_year" -H "Cookie: $SESSION"
# Payment ledger (JSON) and CSV export for 2026
curl -s "$APP_URL/api/reports/payment-ledger?year=2026&status=PAID" -H "Cookie: $SESSION"
curl -s "$APP_URL/api/reports/export?year=2026" -H "Cookie: $SESSION" -o pembayaran-2026.csv
```

## Public routes

### `GET /pay/{token}` — parent payment page

No session; the unguessable per-invoice token is the auth. Resolves via `paymentService.resolvePayPage`:

- Valid unpaid invoice → **302 redirect** to a Midtrans Snap page (reused if still pending/unexpired, else lazily created).
- Otherwise → small Indonesian-language HTML message page (paid already, cancelled, invalid link, error).

This is the **only** place Snap sessions are created for parents — never at generation/reminder time.

### `POST /api/webhooks/midtrans` — payment notification

Verifies the SHA-512 `signature_key` before anything else (401 `WEBHOOK_INVALID` on mismatch). Then `paymentService.handleMidtransWebhook` maps the transaction status onto the invoice (settlement → `PAID`; stale order → `PAID_OLD_LINK`) and sends the confirmation WhatsApp when appropriate (failure to send is logged, not fatal). Returns `{received: true, …}`.

## Cron routes (`/api/cron/*`)

**Auth** (all seven, both methods): `Authorization: Bearer {CRON_SECRET}` (Vercel Cron uses GET) or `x-api-key: {WEBHOOK_SECRET}` (manual, typically POST + JSON overrides). Each route then checks its toggle in `system_config.cron_jobs` and returns `{skipped: true, reason: "cron_disabled"}` when off. All accept GET and POST; POST bodies are optional and zod-validated (an invalid body silently falls back to defaults). All are idempotent.

| Route | vercel.json (UTC → WIB) | `maxDuration` | POST body overrides | Result fields |
|---|---|---|---|---|
| `generate-invoices` | `0 0 1 * *` → 1st 07:00 | 120 | `month` 1–12, `year` ≥2020 (default: current WIB month) | `generated`, … (201 if `generated > 0`) |
| `backfill-payment-links` | `30 0 * * *` → daily 07:30 | 60 | `month`, `year`, `batch_limit` 1–200 | `created`, … (201 if `created > 0`) |
| `send-reminders` | 10 slots: `0,30 2-6 1,11,21 * *` → 09:00–13:30 on the 1st/11th/21st | 300 | `date` `YYYY-MM-DD`, `slot` 1–10 (default: slot inferred from WIB clock; non-reminder days behave as slot 10) | sent/failed counts per phase |
| `reconcile-payments` | `0 15 * * *` → daily 22:00 | — | none (fixed `minAgeHours: 6`) | reconciliation summary |
| `promote-grades` | `0 17 30 6 *` → Jul 1 07:00 | — | `force` bool, `promotionYear` ≥2020 (**required with `force` outside July**) | `promoted`/`unchanged`/`already_promoted` |
| `sync-leave-status` | `15 17 * * *` → daily 00:15 | — | none | `month`, `year`, `marked_on_leave`, `reactivated` |
| `mark-overdue` | `30 17 * * *` → daily 00:30 | 60 | `today` `YYYY-MM-DD` (default: WIB today; for testing the boundary) | `marked` |

Slot semantics: every slot runs Phase 1 — for each invoice with a due (`scheduled_date <= today`) unsent reminder, send only its latest due reminder and cancel earlier due rows ("Digantikan pengingat terbaru"); slot 10 additionally chases overdue/prior months (Phase 2). Constants in [lib/constants.ts](lib/constants.ts).

`mark-overdue` flips every `PENDING` invoice whose `due_date < today` (WIB) to `OVERDUE`. This is the calendar-driven source of the persisted `OVERDUE` ("Terlambat") status — independent of invoice generation. Invoice generation runs the same date-based sweep (its `marked_overdue` count), so the two never disagree.

`sync-leave-status` enforces the status invariant *status = `TEMPORARY_LEAVE` iff the student has a `temporary_leaves` row for the current WIB month* — it marks `ACTIVE` students with a current-month leave as `TEMPORARY_LEAVE` and reverts `TEMPORARY_LEAVE` students without one to `ACTIVE`. `INACTIVE` students are never touched. Billing never reads the status field (it reads `temporary_leaves` rows), so this is display/KPI hygiene only.

### curl recipes

```bash
# Simulate Vercel Cron (GET + bearer)
curl http://localhost:3000/api/cron/generate-invoices \
  -H "Authorization: Bearer $CRON_SECRET"

# Manual override (POST + x-api-key + JSON body)
curl -X POST http://localhost:3000/api/cron/generate-invoices \
  -H "x-api-key: $WEBHOOK_SECRET" -H "Content-Type: application/json" \
  -d '{"month": 6, "year": 2026}'

curl -X POST http://localhost:3000/api/cron/send-reminders \
  -H "x-api-key: $WEBHOOK_SECRET" -H "Content-Type: application/json" \
  -d '{"slot": 10}'   # Phase 1 remainder + overdue chase

curl -X POST http://localhost:3000/api/cron/promote-grades \
  -H "x-api-key: $WEBHOOK_SECRET" -H "Content-Type: application/json" \
  -d '{"force": true, "promotionYear": 2099}'   # off-season, dev only

curl -X POST http://localhost:3000/api/cron/backfill-payment-links \
  -H "x-api-key: $WEBHOOK_SECRET" -H "Content-Type: application/json" \
  -d '{"month": 6, "year": 2026, "batch_limit": 100}'

curl http://localhost:3000/api/cron/sync-leave-status \
  -H "Authorization: Bearer $CRON_SECRET"   # no body overrides; re-run yields zeros

curl -X POST http://localhost:3000/api/cron/mark-overdue \
  -H "x-api-key: $WEBHOOK_SECRET" -H "Content-Type: application/json" \
  -d '{"today": "2026-07-01"}'   # simulate the boundary; omit body for real WIB today
```
