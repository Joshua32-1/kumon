# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Admin panel for a Kumon center: student management, monthly invoicing, Midtrans Snap payment links, and WhatsApp payment reminders. Next.js App Router + TypeScript, Supabase (DB/auth), Midtrans Snap (payments), Meta WhatsApp Cloud API (messaging). Path alias `@/*` → repo root. Admin UI text is in Bahasa Indonesia.

## Detailed docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — request flow, layering contract, auth boundaries, billing automation lifecycle, payment links, messaging
- [DATABASE.md](DATABASE.md) — enums, tables, indexes, `system_config` keys, RPCs, RLS, migration workflow
- [API.md](API.md) — every endpoint with params, auth, cron schedules, and curl recipes

Project skills in `.claude/skills/` are governed by the **Skill Routing** rules below — they are mandatory process, not optional reading.

## Skill Routing (mandatory)

Load every skill whose trigger matches **before** doing the work in its phase. When in doubt, load the skill — a wasted read is acceptable; a missed review is not. Multiple triggers ⇒ load multiple skills.

| Skill | Triggered by | Required phase |
|---|---|---|
| `dev-workflow` | Any implementation task: new feature, new endpoint/action, scaffolding a module, deciding where a change lands, running/triggering crons locally | **Before implementation** |
| `supabase-migrations` | Any touch of `supabase/migrations/`, `types/database.ts`, DB enums/tables/RPCs, `system_config` keys, or schema content in DATABASE.md | **Before implementation** |
| `code-review-checklist` | **Every** code change — feature, bug fix, refactor, rename — i.e. any diff under `app/`, `features/`, `lib/`, `components/`, `types/`, `proxy.ts`, `vercel.json`, `supabase/` | **Before completion** (review step) and before any commit — applied via the `code-reviewer` agent for non-trivial changes (see workflow step 5) |
| `feature-testing` | Any behavior change to verify; any request to test, validate, or confirm a fix, feature, cron job, or workflow; release validation | **Before completion** (validation step) |
| `production-readiness` | Deploying or preparing to deploy; "is this ready for production"; diagnosing production-only failures; changes to env vars ([.env.local.example](.env.local.example)), `vercel.json` cron schedules, webhook config, or middleware/auth exemptions | **Before completion** of any deploy-related task |

Domain → skill map (in addition to the table above):

- **Billing, invoices, payments, reminders, Midtrans, pay links** → `code-review-checklist` + `feature-testing`
- **Cron jobs** (`app/api/cron/*`, `lib/cron/`, `vercel.json`) → `code-review-checklist` + `feature-testing` (idempotency re-run); add `production-readiness` if schedules or env change
- **WhatsApp / Meta templates** (`features/messaging/`, `META_*` vars) → `code-review-checklist` + `feature-testing`; add `production-readiness` for template/env changes
- **Database / migrations** → `supabase-migrations` + `code-review-checklist`
- **Dates / timezone** (`lib/utils.ts`, `lib/billing/`) → `code-review-checklist` (WIB section) + `feature-testing` (date boundaries)

### Mandatory completion workflow

Every task follows these steps in order:

1. **Identify impacted areas** — map the task onto the routing table and domain map above.
2. **Load all matching skills** — read every triggered skill before writing code; pre-implementation skills (`dev-workflow`, `supabase-migrations`) first.
3. **Implement** following the loaded skills' patterns (layering, scaffold, migration rules).
4. **Validate** — always `npx tsc --noEmit`; for behavior changes, run the relevant `feature-testing` recipes and edge cases, including the idempotency re-run.
5. **Review** — for any non-trivial code change (any diff under `app/`, `features/`, `lib/`, `components/`, `types/`, `proxy.ts`, `vercel.json`, `supabase/` beyond a pure typo/comment fix), spawn the `code-reviewer` agent ([.claude/agents/code-reviewer.md](.claude/agents/code-reviewer.md)) via the Agent tool, passing the change scope and the task's original requirements. It independently applies the `code-review-checklist` skill and returns Critical/Warning/Suggestion findings plus an approval status. Fix all **Critical** findings and re-run the agent until it no longer reports any; surface **Warnings** to the user. Do not self-review as a substitute.
6. **Only then is the task complete.** A task that skipped a triggered skill, or a non-trivial change without a `code-reviewer` approval (APPROVED or APPROVED WITH WARNINGS), is not done, even if the code works.

## Commands

```bash
npm run dev        # local dev server (http://localhost:3000)
npm run build      # production build (also the de-facto type check)
npx tsc --noEmit   # type check only
```

There is no test suite or linter — `tsc`/`build` are the only automated gates. Regenerate DB types after schema changes:

```bash
npx supabase gen types typescript --project-id <project-id> > types/database.ts
```

## Layering

- `app/(dashboard)/…`, `app/(auth)/login` — pages; `app/api/…` — route handlers. No business logic here.
- `features/{students,payments,messaging}/` — domain modules: `actions.ts` (server actions: zod-validate via `validations.ts`, call service, `revalidatePath`), `service.ts` (all business logic and DB access), `types.ts`, `components/`.
- `lib/` — infrastructure (Supabase/Midtrans clients, cron auth/toggles) and pure billing helpers (`lib/billing/`).

[features/payments/service.ts](features/payments/service.ts) is the core of the system — most behavior changes land there.

## Hard invariants (violations are bugs)

- **WIB timezone**: all date/billing logic runs in `Asia/Jakarta`. Use the helpers in [lib/utils.ts](lib/utils.ts) (`todayInCenterTimezone`, `currentMonthYearInCenterTimezone`, …) — never raw `new Date()` day/month math. Cron schedules in [vercel.json](vercel.json) are **UTC** (= WIB − 7h).
- **Two Supabase clients**: [lib/supabase/server.ts](lib/supabase/server.ts) (cookie session) for pages/actions; [lib/supabase/admin.ts](lib/supabase/admin.ts) (service role, bypasses RLS) only for cron/webhooks/server-only paths.
- **Lazy Midtrans checkout**: Snap sessions are created only when a parent opens `/pay/{token}` — never during invoice generation or reminder send.
- **One active invoice** per `student_id + month + year` (partial unique index excluding `CANCELLED`/`PAID_OLD_LINK`).
- **Cron routes** must call `verifyCronAuth` ([lib/auth/cron.ts](lib/auth/cron.ts)), check their toggle via [lib/cron/enabled.ts](lib/cron/enabled.ts), and stay idempotent.
- **Messaging** goes through `messagingService` ([features/messaging/service.ts](features/messaging/service.ts)) with Meta named templates (`META_*` vars in [.env.local.example](.env.local.example) — the source of truth for template variable names).
- **Migrations** in `supabase/migrations/` are numbered, applied manually in order; keep app deploys paired with schema state.
