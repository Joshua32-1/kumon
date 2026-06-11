# Database

Schema reference for the Supabase Postgres database. Source of truth: [supabase/migrations/](supabase/migrations/) (0001–0005). TypeScript types are generated into [types/database.ts](types/database.ts).

## Migration workflow

- Files are numbered (`0001_…` … `0005_…`) and **applied manually in order** — Supabase SQL editor or `npx supabase db push`. There is no automatic runner; keep app deploys paired with schema state.
- Never edit a migration that has been applied to production; add the next number instead.
- After any schema change: `npx supabase gen types typescript --project-id <id> > types/database.ts`, then `npx tsc --noEmit`.
- See `.claude/skills/supabase-migrations/SKILL.md` for full conventions.

Current migrations: `0001` initial schema (enums, tables, RLS, config seeds) · `0002` `promote_grades_annual` RPC · `0003` stable pay tokens · `0004` cron job toggles seed · `0005` historical fee schedule seed.

## Enums

| Enum | Values | Notes |
|---|---|---|
| `student_status` | `ACTIVE`, `TEMPORARY_LEAVE`, `INACTIVE` | `ACTIVE` + `TEMPORARY_LEAVE` are billable (minus leave months). |
| `payment_status` | `PENDING`, `PAID`, `OVERDUE`, `CANCELLED`, `WAIVED`, `PAID_OLD_LINK` | `PAID_OLD_LINK` = parent paid a stale/cancelled Midtrans session — manual follow-up, excluded from the active-invoice unique index. |
| `reminder_status` | `PENDING`, `SENT`, `FAILED`, `CANCELLED` | `CANCELLED` when the invoice is cancelled/waived/paid before send. |
| `kumon_subject` | `ENGLISH`, `INDONESIAN`, `MATHEMATICS` | |
| `school_level` | `ELEMENTARY`, `SECONDARY` | Billing tier: TK/SD vs SMP/SMA. Derived from grade. |
| `student_grade` | `TK_1`–`TK_2`, `SD_1`–`SD_6`, `SMP_1`–`SMP_3`, `SMA_1`–`SMA_3` | Promoted annually in July; `SMA_3` stays. |

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
Scheduled WhatsApp reminders, created at invoice generation for the 1st/11th/21st. FK `invoice_id` and `student_id` (both CASCADE). Columns: `reminder_number` (1–3), `scheduled_date`, `sent_at`, `status` (`reminder_status`), `whatsapp_number` (snapshot), `message_preview`. The send cron claims due `PENDING` rows; `SENT` rows are skipped by later slots.

### system_config
Singleton settings as JSONB rows — prefer a new key here over a new one-row table.

| Key | Shape | Purpose |
|---|---|---|
| `subject_fees` | `{elementary: {english, indonesian, mathematics}, secondary: {…}}` | Current per-subject monthly fees (Rupiah) |
| `subject_fees_schedule` | `[{year, month, fees}, …]` | Historical rates effective from that billing month — used so regenerated old invoices bill period-accurate fees. Appended automatically when `subject_fees` is saved in Settings |
| `reminder_days` | `{days: [1, 11, 21]}` | |
| `max_leave_months` | `{months: 3}` | Consecutive-leave review threshold |
| `center_name` | `{name: …}` | |
| `cron_jobs` | `{generate_invoices: {enabled}, backfill_payment_links, send_reminders, reconcile_payments, promote_grades}` | Per-job toggles read by [lib/cron/enabled.ts](lib/cron/enabled.ts), edited from Settings |
| `grade_promotion` | `{year: 2025 \| null}` | Last completed promotion year — the RPC's idempotency latch |
| `whatsapp_provider` | `{provider: …}` | Legacy seed; the active provider is configured via `META_*` env vars |

## Functions and triggers

- **`promote_grades_annual(p_promotion_year INTEGER) → JSONB`** (0002) — advances `ACTIVE`/`TEMPORARY_LEAVE` grades one step (TK 1 → … → SMA 3; SMA 3 unchanged), updates `school_level`, records the year in `grade_promotion`. Locks the config row (`FOR UPDATE`) and returns `{already_promoted: true, …}` if the year was already done. `SECURITY DEFINER SET search_path = public`.
- **`update_updated_at()`** — trigger on `students`, `contacts`, `invoices` setting `updated_at = NOW()` on update.

## Row Level Security

RLS is enabled on every table with a single policy pattern: `admin_all` — `FOR ALL TO authenticated USING (true) WITH CHECK (true)`. Any logged-in user is an admin; there is no per-row ownership. The service-role client ([lib/supabase/admin.ts](lib/supabase/admin.ts)) bypasses RLS entirely for cron/webhook paths. New tables must enable RLS and add the same policy or session-client queries will silently return nothing.
