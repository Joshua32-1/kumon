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
 * Pick the reminder to act on from a candidate set (already filtered to
 * PENDING/FAILED, and to due rows for the scheduled path):
 * - scheduled path → the HIGHEST reminder_number (most recent slot), so a row
 *   stranded in the past is sent once and never out of order
 * - ignoreSchedule (bulk send) → the LOWEST reminder_number (original behavior)
 */
export function selectDueReminder<T extends { reminder_number: number }>(
  reminders: T[],
  options: { ignoreSchedule: boolean }
): T | null {
  if (reminders.length === 0) return null
  const sorted = [...reminders].sort((a, b) =>
    options.ignoreSchedule
      ? a.reminder_number - b.reminder_number
      : b.reminder_number - a.reminder_number
  )
  return sorted[0]
}
