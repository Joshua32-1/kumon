---
name: supabase-migrations
description: How to write, order, and ship Supabase schema migrations in this repo. Use when adding or editing files in supabase/migrations/, changing enums/tables/RPCs, or when a change requires regenerating types/database.ts.
---

# Supabase Migrations

Migrations live in `supabase/migrations/` as `NNNN_short_name.sql`, applied **manually in numeric order** (Supabase SQL editor or `npx supabase db push`). There is no automatic migration runner in CI or deploy — the database and app code are paired by hand. Schema reference: [DATABASE.md](../../../DATABASE.md).

## Writing a new migration

1. **Number it next in sequence** (`0006_...` after `0005_...`). Never renumber or edit a migration that has already been applied to the production database; add a new one instead. (Exception: this repo has historically consolidated migrations for fresh installs *before* production existed — only do that if explicitly asked.)
2. **Start with a one-line comment** explaining intent, matching existing style (see `0003_payment_access_token.sql`).
3. **Make it safe to re-run where cheap**: seeds and config rows use `INSERT ... ON CONFLICT (key) DO NOTHING`; functions use `CREATE OR REPLACE`. Pure DDL (ADD COLUMN, CREATE INDEX) is applied once and need not be guarded, but backfills must be (e.g. `UPDATE ... WHERE col IS NULL` before `SET NOT NULL`).
4. **Follow existing schema idioms**:
   - `UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `created_at`/`updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` (attach the `update_updated_at` trigger for `updated_at`).
   - Domain values are Postgres **enums** (`payment_status`, `student_grade`, …). Adding an enum value is append-only (`ALTER TYPE ... ADD VALUE`) and cannot run inside a transaction together with code that uses the new value.
   - Singleton app settings are JSON rows in `system_config` keyed by name (`subject_fees`, `subject_fees_schedule`, `cron_jobs`, `grade_promotion`) — prefer a new key there over a new one-row table.
   - RPCs called from cron use `SECURITY DEFINER SET search_path = public` and return a JSONB summary (see `promote_grades_annual` in `0002_functions.sql`).
   - New tables need RLS enabled plus the `admin_all` policy (`FOR ALL TO authenticated USING (true) WITH CHECK (true)`) like `0001_initial_schema.sql` — otherwise session-client queries silently return nothing. The service-role client bypasses RLS for cron/webhooks.

## After the SQL

- **Regenerate types**: `npx supabase gen types typescript --project-id <id> > types/database.ts`, then `npx tsc --noEmit`. App code referencing new columns/enums will not compile until this is done. If the migration hasn't been applied to a live project yet, hand-edit `types/database.ts` to match and note it must be regenerated after apply.
- **Update app-side mirrors**: enum changes usually have TypeScript counterparts (`features/*/types.ts`, status badges, zod schemas in `validations.ts`) and config keys have parsers (`lib/cron/jobs.ts`, `lib/billing/load-subject-fees.ts`).
- **Update docs**: add the table/enum/key to DATABASE.md, and add the migration to README.md's "Deploy checklist" with a SQL verification snippet (enum labels, function existence, etc.).

## Deploy ordering

Apply migrations **before or together with** the app deploy that needs them; cron routes hit the DB unattended and fail at runtime if an RPC or column is missing. Rolling back app code without the schema can leave rows/enum values the old app does not understand — call out one-way changes (new enum values, dropped columns) in the PR.
