# Database

Schema reference for the Supabase Postgres database. Source of truth: [supabase/migrations/](supabase/migrations/) (0001–0012). TypeScript types are generated into [types/database.ts](types/database.ts).

## Migration workflow

- Files are numbered (`0001_…` … `0012_…`) and **applied manually in order** — Supabase SQL editor or `npx supabase db push`. There is no automatic runner; keep app deploys paired with schema state.
- Never edit a migration that has been applied to production; add the next number instead.
- After any schema change: `npx supabase gen types typescript --project-id <id> > types/database.ts`, then `npx tsc --noEmit`.
- See `.claude/skills/supabase-migrations/SKILL.md` for full conventions.

Current migrations: `0001` initial schema (enums, tables, RLS, config seeds) · `0002` `promote_grades_annual` RPC · `0003` stable pay tokens · `0004` cron job toggles seed · `0005` historical fee schedule seed · `0006` integrity CHECK constraints (non-negative `invoices.amount`/`invoice_line_items.unit_amount`, `year` 2000–2100 on `invoices`/`temporary_leaves`, `payment_reminders.reminder_number >= 1`, non-blank `full_name` on `students`/`contacts`).

Verify `0006`: `SELECT conname FROM pg_constraint WHERE conname IN ('invoices_amount_nonneg','invoice_line_items_unit_amount_nonneg','invoices_year_range','temporary_leaves_year_range','payment_reminders_number_positive','students_full_name_not_blank','contacts_full_name_not_blank');` should return 7 rows.

`0007` atomic invoice writes — `create_invoice_with_lines(p_invoice jsonb, p_lines jsonb, p_reminder_days int[]) → uuid` and `regenerate_invoice_lines(p_invoice_id uuid, p_amount int, p_school_level school_level, p_lines jsonb) → void`, both `SECURITY DEFINER`, so invoice + line items (+ reminders) are written in one transaction instead of separate PostgREST calls. Verify: `SELECT proname FROM pg_proc WHERE proname IN ('create_invoice_with_lines','regenerate_invoice_lines');` should return 2 rows.

`0008` require ≥1 line item — both RPCs above (`CREATE OR REPLACE`) now raise `check_violation` when `p_lines` is empty, so a student with no billable subjects can never get an invoice (and therefore no reminders). Verify: `SELECT create_invoice_with_lines('{}'::jsonb, '[]'::jsonb, '{}'::int[]);` should error with "invoice must have at least one line item".

`0009` promote-grades year guard — `CREATE OR REPLACE promote_grades_annual` rejects `p_promotion_year` outside `[2020 .. current WIB year]`. Verify: `SELECT promote_grades_annual(EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::int + 1);` should error "invalid promotion year".

`0010` paid-leave conflict resolutions — new `paid_leave_conflict_resolutions` table backing the dashboard "Tagihan sudah dibayar untuk bulan cuti" panel. A PAID invoice whose billing month also has a `temporary_leaves` row is a conflict, shown all-time (no month window) until an admin clicks "Tandai selesai" (one resolution row per invoice) or the cuti is cancelled. Verify: `SELECT count(*) FROM pg_policies WHERE tablename = 'paid_leave_conflict_resolutions' AND policyname = 'admin_all';` should return 1.

`0011` drop legacy `whatsapp_provider` config — removes the unused `whatsapp_provider` `system_config` seed (messaging runs on the Meta WhatsApp Cloud API via `META_*` env vars). Harmless no-op if already absent. Verify: `SELECT count(*) FROM system_config WHERE key = 'whatsapp_provider';` should return 0.

`0012` clamp reminder days — `CREATE OR REPLACE create_invoice_with_lines` clamps each `reminder_days` value into the invoice month's `[1, last_day]` range before `make_date`, so a misconfigured day (e.g. 31) can't crash generation on short months. Verify: temporarily set `system_config.reminder_days` to `{"days":[1,11,31]}` and create a February invoice — the third reminder lands on Feb 28/29, no error.

`0013` message_events — WhatsApp delivery tracking table + `message_event_type` / `message_delivery_status` enums (see Tables/Enums). Verify: `SELECT to_regclass('public.message_events');` is non-null.

`0014` bulk invoice generation — `create_invoices_with_lines(p_invoices jsonb, p_reminder_days int[]) → uuid[]`, a server-side loop that inserts the whole batch in one call (per-row `unique_violation` skipped), so generation scales to hundreds of students within the cron timeout. Verify: `SELECT proname FROM pg_proc WHERE proname = 'create_invoices_with_lines';` returns 1 row.

## Enums

| Enum | Values | Notes |
|---|---|---|
| `student_status` | `ACTIVE`, `TEMPORARY_LEAVE`, `INACTIVE` | `ACTIVE` + `TEMPORARY_LEAVE` are billable (minus leave months). |
| `payment_status` | `PENDING`, `PAID`, `OVERDUE`, `CANCELLED`, `WAIVED`, `PAID_OLD_LINK` | `PAID_OLD_LINK` = parent paid a stale/cancelled Midtrans session — manual follow-up, excluded from the active-invoice unique index. |
| `reminder_status` | `PENDING`, `SENT`, `FAILED`, `CANCELLED` | `CANCELLED` when the invoice is cancelled/waived/paid before send. |
| `kumon_subject` | `ENGLISH`, `INDONESIAN`, `MATHEMATICS` | |
| `school_level` | `ELEMENTARY`, `SECONDARY` | Billing tier: TK/SD vs SMP/SMA. Derived from grade. |
| `student_grade` | `TK_1`–`TK_2`, `SD_1`–`SD_6`, `SMP_1`–`SMP_3`, `SMA_1`–`SMA_3` | Promoted annually in July; `SMA_3` stays. |
| `message_event_type` | `REMINDER`, `CONFIRMATION` | Which kind of WhatsApp message a `message_events` row tracks (0013). |
| `message_delivery_status` | `SENT`, `DELIVERED`, `READ`, `FAILED` | Meta delivery state of a sent message; advanced by the Meta webhook (0013). |

Enum changes ripple into app code: regenerate types, then update `features/*/types.ts` mirrors, zod schemas in `validations.ts`, and status badges/filters.

## Tables

### students
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `full_name` | TEXT NOT NULL | |
| `grade` | `student_grade` NOT NULL | |
| `school_level` | `school_level` NOT NULL | Default `ELEMENTARY`; kept in sync with grade |
| `status` | `student_status` NOT NULL | Default `ACTIVE` |
| `enrolled_at` | DATE NOT NULL | Default `CURRENT_DATE`; gates billable periods |
| `deactivated_at` | TIMESTAMPTZ | |
| `notes` | TEXT | |
| `created_at` / `updated_at` | TIMESTAMPTZ | `updated_at` auto-set by trigger |

### contacts
Parent/guardian WhatsApp contacts. FK `student_id` → students (CASCADE). Columns: `full_name`, `relationship`, `whatsapp_number`, `is_primary`.
**At most one primary contact per student**: partial unique index `contacts_student_primary_idx ON contacts(student_id) WHERE is_primary = TRUE`.

### temporary_leaves
One row per student per month on leave. FK `student_id` (CASCADE), `month` (1–12 CHECK), `year`, `reason`, `created_by` → `auth.users`.
Unique `(student_id, month, year)`. A row here makes the student non-billable for that month. Consecutive-month streaks against the `max_leave_months` config drive the leave-review alerts.
`students.status = TEMPORARY_LEAVE` is derived from these rows: it means "has a leave row for the current WIB month" and is kept in sync on write (`setLeave`/`setLeaveBulk`/`cancelLeave`) plus nightly by the `sync-leave-status` cron. Billing never reads the status field — these rows are the source of truth.

### paid_leave_conflict_resolutions
One row per resolved paid-leave conflict. FK `invoice_id` (CASCADE, **UNIQUE** — doubles as the lookup index), `note`, `created_by` → `auth.users`, `created_at` (= resolution time; rows are immutable). A PAID invoice whose `(student, month, year)` matches a `temporary_leaves` row is a conflict (`listPaidLeaveConflicts`); inserting a row here ("Tandai selesai") removes it from the dashboard panel. Resolutions are **permanent per invoice** — re-recording then re-cancelling a cuti for the same paid invoice will not resurface it. Idempotent: a duplicate insert (already resolved) is swallowed via the `23505` unique violation.

### student_subjects
Enrollment per subject. FK `student_id` (CASCADE), `subject` (`kumon_subject`), `enrolled_at`. Unique `(student_id, subject)`. Students with zero rows are skipped at invoice generation.

### invoices
The central table.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `student_id` | UUID FK → students | **ON DELETE RESTRICT** — students with invoices can't be hard-deleted |
| `month` / `year` | INTEGER | `month` CHECK 1–12 |
| `amount` | INTEGER | Rupiah, sum of line items |
| `status` | `payment_status` | Default `PENDING` |
| `due_date` | DATE NOT NULL | |
| `paid_at` | TIMESTAMPTZ | |
| `school_level_at_billing` | `school_level` NOT NULL | Tier snapshot at generation time |
| `midtrans_order_id` | TEXT UNIQUE | Current order; `midtrans_order_ids TEXT[]` keeps history across regenerations |
| `midtrans_payment_url` / `midtrans_transaction_id` | TEXT | |
| `payment_access_token` | TEXT NOT NULL UNIQUE | (0003) stable `/pay/{token}` token; `midtrans_snap_created_at` tracks lazy session creation |
| `notes`, `created_by`, timestamps | | |

**Key index** — `invoices_student_month_year_active_idx`: `UNIQUE (student_id, month, year) WHERE status NOT IN ('CANCELLED', 'PAID_OLD_LINK')`. At most one *active* invoice per student per billing month; inserts must expect this conflict. Plus `invoices_payment_access_token_idx` (unique token).

### invoice_line_items
Per-subject breakdown. FK `invoice_id` (CASCADE), `subject`, `label` (display text used in WhatsApp messages), `unit_amount` (Rupiah). Unique `(invoice_id, subject)`.

### payment_reminders
Scheduled WhatsApp reminders, created at invoice generation for the 1st/11th/21st. FK `invoice_id` and `student_id` (both CASCADE). Columns: `reminder_number` (1–3, internal slot/order index — not shown to parents), `scheduled_date`, `sent_at`, `status` (`reminder_status`), `whatsapp_number` (snapshot), `message_preview`. The send cron processes each invoice with a due (`scheduled_date <= today`) unsent reminder and sends only its **latest** due reminder, marking earlier due rows `CANCELLED` ("Digantikan pengingat terbaru") so a reminder stranded in the past (mid-month enrollment / cuti rebill) can't fire later or out of order; `SENT` rows are skipped by later slots.

### message_events
WhatsApp message delivery tracking (0013). One row per sent reminder/confirmation, keyed by Meta's `wamid` (UNIQUE). Columns: `message_type` (`message_event_type`), `invoice_id` (FK CASCADE, nullable), `reminder_id` (FK SET NULL, nullable — confirmations have none), `recipient`, `status` (`message_delivery_status`, default `SENT`), `error_code`/`error_title`, and `sent_at`/`delivered_at`/`read_at`/`failed_at` timestamps. Inserted on a successful send (`paymentService._recordMessageEvent`); advanced to `DELIVERED`/`READ`/`FAILED` by the Meta webhook (`/api/webhooks/meta`), forward-progress only. Standalone (not columns on `payment_reminders`) so it tracks both reminders **and** confirmations, which create no reminder row.

### system_config
Singleton settings as JSONB rows — prefer a new key here over a new one-row table.

| Key | Shape | Purpose |
|---|---|---|
| `subject_fees` | `{elementary: {english, indonesian, mathematics}, secondary: {…}}` | Current per-subject monthly fees (Rupiah) |
| `subject_fees_schedule` | `[{year, month, fees}, …]` | Historical rates effective from that billing month — used so regenerated old invoices bill period-accurate fees. Appended automatically when `subject_fees` is saved in Settings |
| `reminder_days` | `{days: [1, 11, 21]}` | |
| `max_leave_months` | `{months: 3}` | Consecutive-leave review threshold |
| `center_name` | `{name: …}` | |
| `cron_jobs` | `{generate_invoices: {enabled}, backfill_payment_links, send_reminders, reconcile_payments, promote_grades, sync_leave_status, mark_overdue, billing_watchdog}` | Per-job toggles read by [lib/cron/enabled.ts](lib/cron/enabled.ts), edited from Settings. Ids missing from the stored value default to enabled (`parseCronJobsConfig`), so new jobs (e.g. `billing_watchdog`) need no reseed |
| `grade_promotion` | `{year: 2025 \| null}` | Last completed promotion year — the RPC's idempotency latch |

## Functions and triggers

- **`promote_grades_annual(p_promotion_year INTEGER) → JSONB`** (0002, hardened in 0009) — advances `ACTIVE`/`TEMPORARY_LEAVE` grades one step (TK 1 → … → SMA 3; SMA 3 unchanged), updates `school_level`, records the year in `grade_promotion`. Locks the config row (`FOR UPDATE`) and returns `{already_promoted: true, …}` if the year was already done. **(0009)** rejects `p_promotion_year` outside `[2020 .. current WIB year]` with a `check_violation`, so a future/typo year can't freeze or over-advance promotions. `SECURITY DEFINER SET search_path = public`.
- **`create_invoice_with_lines(p_invoice JSONB, p_lines JSONB, p_reminder_days INT[]) → UUID`** (0007) — inserts one invoice, its line items, and (when the student has a primary contact) its reminders in a single transaction; raises `unique_violation` on a duplicate active invoice. Fee/enrollment logic stays in TS; this only persists the precomputed payload. Used by `generateMonthly*`. `SECURITY DEFINER SET search_path = public`.
- **`create_invoices_with_lines(p_invoices JSONB, p_reminder_days INT[]) → UUID[]`** (0014) — bulk variant of the above: a server-side loop inserts the whole batch in one round-trip, each student in its own sub-block so a per-row `unique_violation` skips only that student. Returns the ids actually created (caller derives `skipped_existing` from attempted − created). Used by the automated `generateMonthly*` path so generation scales to hundreds of students. `SECURITY DEFINER SET search_path = public`.
- **`regenerate_invoice_lines(p_invoice_id UUID, p_amount INT, p_school_level school_level, p_lines JSONB) → VOID`** (0007) — atomically replaces an invoice's line items + amount and nulls its Midtrans session fields (recalc). Used by `regenerateInvoice`. `SECURITY DEFINER`.
- **`update_updated_at()`** — trigger on `students`, `contacts`, `invoices`, `message_events` setting `updated_at = NOW()` on update.

## Row Level Security

RLS is enabled on every table with a single policy pattern: `admin_all` — `FOR ALL TO authenticated USING (true) WITH CHECK (true)`. Any logged-in user is an admin; there is no per-row ownership. The service-role client ([lib/supabase/admin.ts](lib/supabase/admin.ts)) bypasses RLS entirely for cron/webhook paths. New tables must enable RLS and add the same policy or session-client queries will silently return nothing.
