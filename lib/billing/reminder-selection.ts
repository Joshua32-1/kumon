import { isPriorBillingPeriod, dayOfMonthFromDateString } from "@/lib/utils"
import type { PaymentStatus } from "@/features/payments/types"

// Pure reminder-pipeline decision helpers (extracted from
// features/payments/service.ts). The service still owns the DB queries and the
// supersede/cancel writes; these decide membership and which row to act on.

/** Is `today` (YYYY-MM-DD) one of the configured global reminder days (1/11/21)? */
export function isReminderDay(today: string, reminderDays: number[]): boolean {
  return reminderDays.includes(dayOfMonthFromDateString(today))
}

/**
 * An unpaid invoice is eligible for the Phase-2 overdue chase when it is OVERDUE,
 * or PENDING but from a billing period prior to the current month.
 */
export function isOverdueChaseEligible(options: {
  status: PaymentStatus
  month: number
  year: number
  currentMonth: number
  currentYear: number
}): boolean {
  const { status, month, year, currentMonth, currentYear } = options
  if (status === "OVERDUE") return true
  if (status === "PENDING") {
    return isPriorBillingPeriod(month, year, currentMonth, currentYear)
  }
  return false
}

/**
 * Decide which reminder to send and whether to supersede older due rows. Pass ALL of an
 * invoice's reminders (any status); the helper picks among the sendable (PENDING/FAILED)
 * ones and reads SENT rows only to decide whether the bulk push-ahead is allowed.
 * - Prefer DUE rows (scheduled_date <= today): pick the HIGHEST reminder_number and
 *   supersede the older due rows — the latest slot the parent should hear about. This
 *   keeps a mid-month enrollment (all slots already past) from sending a stale
 *   reminder 1 and stranding the rest for the cron to re-send.
 * - If nothing is due yet: the scheduled path sends nothing (target null); the bulk
 *   path (ignoreSchedule) falls back to the EARLIEST future row without superseding, so
 *   an admin can push a link ahead of schedule — BUT only when nothing has been sent
 *   yet, so a re-run never advances the cadence past a reminder the parent already got.
 *
 * `scheduled_date` is compared as an ISO `YYYY-MM-DD` string (lexicographic == chronological),
 * matching the SQL `scheduled_date <= today` predicates in the service. Ties are not
 * expected — reminder_number is unique per invoice — so the sort fully determines the pick.
 */
export function selectReminderToSend<
  T extends { reminder_number: number; scheduled_date: string; status: string }
>(
  reminders: T[],
  options: { today: string; ignoreSchedule: boolean }
): { target: T | null; supersede: boolean } {
  const sendable = reminders.filter(
    (r) => r.status === "PENDING" || r.status === "FAILED"
  )
  const due = sendable.filter((r) => r.scheduled_date <= options.today)
  if (due.length > 0) {
    const [highest] = [...due].sort((a, b) => b.reminder_number - a.reminder_number)
    return { target: highest, supersede: true }
  }
  const alreadySent = reminders.some((r) => r.status === "SENT")
  if (options.ignoreSchedule && sendable.length > 0 && !alreadySent) {
    const [lowest] = [...sendable].sort((a, b) => a.reminder_number - b.reminder_number)
    return { target: lowest, supersede: false }
  }
  return { target: null, supersede: false }
}
