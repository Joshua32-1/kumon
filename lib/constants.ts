export const DEFAULT_REMINDER_DAYS = [1, 11, 21]
export const BILLABLE_STUDENT_STATUSES = ["ACTIVE", "TEMPORARY_LEAVE"] as const

/**
 * Ten 30-min morning slots on reminder days (09:00–13:30 WIB).
 *
 * Capacity is governed by REMINDER_RUN_BUDGET_MS, not by the batch limit: a send costs
 * `delayMs` plus ~2.2s of Meta API + DB write, so at the 500 ms default each slot fits
 * ~100 sends and the day ~1000 — just above the ~900 owed (current month plus up to
 * REMINDER_CHASE_MAX_PRIOR_MONTHS of arrears).
 *
 * Both phases now cost the same per send; Phase 2 used to run ~0.9s slower because it
 * looked a contact up per invoice. The margin over what's owed is thin, so treat a
 * persistent `truncated: true` as the signal to revisit these numbers — the next lever
 * is a plan that allows a maxDuration above the 300s Hobby ceiling.
 */
export const REMINDER_SLOT_COUNT = 10
/**
 * Slots below this run Phase 1 only; this slot and above also chase overdue/prior-month.
 * Phase 1 always drains first *within* an invocation and Phase 2 only spends what's left,
 * so starting the chase early costs current-month parents nothing while giving arrears
 * eight slots instead of one. It also blunts Vercel cron drift, which silently reassigns
 * slots because `inferSlot()` reads the wall clock.
 */
export const REMINDER_PHASE2_START_SLOT = 3
export const REMINDER_SLOT_START_MINUTES_WIB = 9 * 60
export const REMINDER_SLOT_INTERVAL_MIN = 30
export const REMINDER_SLOT_INFER_OFFSET_MIN = 15

/**
 * Wall-clock budget for one send-reminders invocation, below the route's
 * `maxDuration = 300` (the Hobby-plan ceiling) so the handler returns
 * `truncated: true` instead of being killed mid-loop, which loses the result and
 * hides the dropped work. Raise both together if the plan ever allows more.
 */
export const REMINDER_RUN_BUDGET_MS = 270_000

/**
 * Same idea for the admin "Kirim Link via WhatsApp" bulk send, but stricter, because the
 * /payments segment carries the same 300s ceiling while spending more of it *after* the
 * loop returns: two `revalidatePath` calls and the RSC re-render (which re-authenticates
 * in the dashboard layout). Cold start is unbudgeted too — the clock starts at service
 * entry, not request entry. The guard is also checked *before* a send, so a run can
 * overshoot by one full send (~2.7s) plus that tail. 240s leaves ~60s for all of it.
 *
 * Costs ~11 sends per run against the cron's budget; the admin just runs it again, and
 * now sees `truncated: true` telling them to. The alternative — spending the margin and
 * being killed at 300s — is what this whole guard exists to prevent.
 */
export const PAYMENT_LINK_RUN_BUDGET_MS = 240_000

/**
 * How many billing periods back the Phase 2 chase reaches. Bounds per-household
 * message volume as unpaid invoices accumulate; older debt moves to manual follow-up.
 */
export const REMINDER_CHASE_MAX_PRIOR_MONTHS = 3

/**
 * Safety cap per invocation, shared by the reminder cron and the admin bulk send —
 * both read the same `WHATSAPP_BATCH_LIMIT` env var, so one fallback keeps them from
 * disagreeing whenever it is unset. The time budgets above are the real governor: at the
 * default delay a run hits ~90-100 sends and stops on the clock, never on this number.
 */
export const REMINDER_BATCH_LIMIT_DEFAULT = 200
/** Pause between sends; ~2 msg/s, far under Meta's ~80 msg/s ceiling. */
export const WHATSAPP_SEND_DELAY_MS_DEFAULT = 500
