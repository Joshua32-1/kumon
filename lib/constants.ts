export const DEFAULT_REMINDER_DAYS = [1, 11, 21]
export const BILLABLE_STUDENT_STATUSES = ["ACTIVE", "TEMPORARY_LEAVE"] as const

/**
 * Ten 30-min morning slots on reminder days (09:00–13:30 WIB).
 *
 * Capacity is governed by REMINDER_RUN_BUDGET_MS, not by the batch limit: a send
 * costs `delayMs` plus ~2.2s of Meta API + DB write, so at the 1000 ms default
 * each slot fits ~170 sends and the day ~1700 — comfortably above the ~900 owed
 * (current month + up to REMINDER_CHASE_MAX_PRIOR_MONTHS of arrears).
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
 * `maxDuration = 600` so the handler returns `truncated: true` instead of being
 * killed mid-loop (which loses the result and hides the dropped work).
 */
export const REMINDER_RUN_BUDGET_MS = 540_000

/**
 * How many billing periods back the Phase 2 chase reaches. Bounds per-household
 * message volume as unpaid invoices accumulate; older debt moves to manual follow-up.
 */
export const REMINDER_CHASE_MAX_PRIOR_MONTHS = 3

/** Safety cap per invocation. The time budget above is the real governor. */
export const REMINDER_BATCH_LIMIT_DEFAULT = 200
/** Pause between sends; ~1 msg/s, far under Meta's ~80 msg/s ceiling. */
export const WHATSAPP_SEND_DELAY_MS_DEFAULT = 1000
