---
name: dev-workflow
description: Everyday convenience reference for working in this repo — common commands, where each kind of change lands, the scaffold pattern for new feature work, and quick cron trigger recipes. Use at the start of routine dev tasks, when unsure where a change belongs, or when scaffolding a new feature/domain module.
---

# Dev Workflow

## Commands

```bash
npm run dev                 # dev server at http://localhost:3000
npx tsc --noEmit            # type check (no test suite or linter exists)
npm run build               # production build — run before calling work done
npx supabase gen types typescript --project-id <id> > types/database.ts   # after schema changes
```

Quick cron trigger (full recipes in [API.md](../../../API.md)):

```bash
curl http://localhost:3000/api/cron/<job> -H "Authorization: Bearer $CRON_SECRET"          # defaults
curl -X POST http://localhost:3000/api/cron/<job> \
  -H "x-api-key: $WEBHOOK_SECRET" -H "Content-Type: application/json" -d '{...overrides}'  # custom
```

Jobs: `generate-invoices`, `send-reminders`, `reconcile-payments`, `backfill-payment-links`, `promote-grades`. If a job answers `cron_disabled`, enable it in Settings or the `system_config.cron_jobs` row.

## Where changes land

| Change | Location |
|---|---|
| Invoice/reminder/payment behavior | `features/payments/service.ts` (the system core) |
| Student/leave/grade behavior | `features/students/service.ts` |
| WhatsApp message content or provider | `features/messaging/service.ts` (+ Meta template vars in `.env.local.example`) |
| Pure billing math (fees, periods, arrears, grades) | `lib/billing/*` (side-effect-free helpers) |
| Fee amounts / reminder days / leave limit / cron toggles | Settings UI → `system_config` rows — config data, not code |
| Date/timezone logic | `lib/utils.ts` WIB helpers — extend there, never inline `new Date()` math |
| Admin UI copy (Bahasa Indonesia) | The owning component: `features/*/components/`, `components/shared/`, or `app/(dashboard)/` page |
| Cron schedule | `vercel.json` — **UTC**, subtract 7h from the intended WIB time |
| New endpoint | `app/api/.../route.ts` — thin handler: parse/validate → service → `apiSuccess`/`apiError` envelope |
| Schema | `supabase/migrations/` — use the `supabase-migrations` skill |

## Scaffold pattern for feature work

Mirror `features/payments/` (the most complete module). For a new action in an existing domain:

1. **`validations.ts`** — zod schema for the input.
2. **`actions.ts`** — `"use server"`; `schema.safeParse` → return `{ error: parsed.error.flatten().fieldErrors }` on failure → call the service → `revalidatePath` for every affected page → return `{ data }`.
3. **`service.ts`** — the actual logic and DB access. Pick the client deliberately: `createSupabaseServerClient` (session) for user paths, `supabaseAdmin` only for cron/webhook/no-session paths. Throw `AppError`s from `lib/errors.ts`.
4. **`components/`** — client components call the action and `toast` (sonner) the result; shared primitives live in `components/shared/` and `components/ui/` (shadcn).
5. New user-facing strings in **Bahasa Indonesia**.

Finish with `npx tsc --noEmit`; for behavior changes, run the relevant recipe from the `feature-testing` skill, and review against `code-review-checklist` before committing.
