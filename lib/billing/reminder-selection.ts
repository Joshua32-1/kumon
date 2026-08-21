import {
  isPriorBillingPeriod,
  dayOfMonthFromDateString,
  shiftDateString,
  todayInCenterTimezone,
} from "@/lib/utils"
import { billingPeriodIndex, shiftBillingPeriod } from "@/lib/billing/billing-period"
import type { PaymentStatus } from "@/features/payments/types"

// Pure reminder-pipeline decision helpers (extracted from
// features/payments/service.ts). The service still owns the DB queries and the
// supersede/cancel writes; these decide membership and which row to act on.

/** Is `today` (YYYY-MM-DD) one of the configured global reminder days (1/11/21)? */
export function isReminderDay(today: string, reminderDays: number[]): boolean {
  return reminderDays.includes(dayOfMonthFromDateString(today))
}

/**
 * Oldest `scheduled_date` from which a FAILED reminder is still retried on `today`.
 *
 * The service turns this into the lower bound of the Phase-1 FAILED branch, the same way
 * `chaseWindowPeriods` becomes Phase 2's period filter: the DB query narrows the scan and
 * `isPhase1DueReminder` re-checks the rows that come back, so the SQL and the rule can't
 * drift apart silently.
 */
export function failedRetryWindowStart(today: string, windowDays: number): string {
  return shiftDateString(today, -windowDays)
}

/**
 * Does this reminder row belong in Phase 1's due set — i.e. should the cron pick its
 * invoice up on `today`?
 *
 * The two sendable statuses are deliberately asymmetric:
 * - PENDING is unbounded below (`scheduled_date <= today`), so a reminder stranded in the
 *   past by a mid-month enrollment, manual generation or cuti rebill still self-heals.
 * - FAILED is bounded. Without a lower bound a permanently broken number would be
 *   re-attempted on every slot forever; without a *window* — the old `scheduled_date = today`
 *   rule — a row that failed during an outage was dropped for good the moment the calendar
 *   day rolled over, and the parent silently never heard from us. The window is the middle
 *   ground: retried on the next reminder day, then abandoned.
 *
 * The window is measured from the LATER of `first_failed_on` (the day the send was actually
 * attempted) and `scheduled_date`. Anchoring to the attempt is the point: the two dates agree
 * only while the schedule and the cron cadence agree, and when they drift — a `reminder_days`
 * config `vercel.json` does not follow — the first attempt lands days after `scheduled_date`,
 * so a schedule-anchored window could expire before the next run and strand the row exactly
 * as it did before the window existed.
 *
 * Taking the later of the two, rather than simply preferring `first_failed_on`, matters
 * because a failure can also land *before* the row is due: the admin bulk push-ahead
 * (`ignoreSchedule`) sends the earliest future reminder, so a failure there stamps a
 * `first_failed_on` earlier than `scheduled_date`. Anchoring on that would expire the window
 * before the row ever came due and the reminder would never be sent at all. Rows predating
 * the column have no `first_failed_on` and fall back to `scheduled_date`, the behaviour they
 * were written under.
 *
 * Widening FAILED does not multiply sends. An invoice is sent at most once per run, and
 * `selectReminderToSend` prefers the highest-numbered due row — so a rediscovered FAILED
 * row that has been overtaken by a newer due reminder is superseded rather than re-sent.
 * It only produces a send when nothing newer is waiting, which is exactly the stranded case.
 *
 * Dates are compared as ISO `YYYY-MM-DD` strings (lexicographic == chronological), matching
 * the SQL predicates in the service.
 */
export function isPhase1DueReminder(
  reminder: {
    status: string
    scheduled_date: string
    // Required, not optional: a caller that forgets to select the column would otherwise
    // type-check while silently reverting to the scheduled_date anchor this exists to replace.
    first_failed_on: string | null
  },
  options: { today: string; failedRetryFrom: string }
): boolean {
  if (reminder.scheduled_date > options.today) return false
  if (reminder.status === "PENDING") return true
  if (reminder.status === "FAILED") {
    const anchor =
      reminder.first_failed_on && reminder.first_failed_on > reminder.scheduled_date
        ? reminder.first_failed_on
        : reminder.scheduled_date
    return anchor >= options.failedRetryFrom
  }
  return false
}

/**
 * An unpaid invoice is eligible for the Phase-2 overdue chase when it is OVERDUE,
 * or PENDING but from a billing period prior to the current month.
 *
 * `maxPriorMonths` bounds how far back the chase reaches, so per-household message
 * volume stays flat as unpaid invoices accumulate instead of growing a message per
 * unpaid month forever. Omit it to consider every prior period (the pre-cap behaviour).
 */
export function isOverdueChaseEligible(options: {
  status: PaymentStatus
  month: number
  year: number
  currentMonth: number
  currentYear: number
  maxPriorMonths?: number
}): boolean {
  const { status, month, year, currentMonth, currentYear, maxPriorMonths } = options

  const statusEligible =
    status === "OVERDUE" ||
    (status === "PENDING" &&
      isPriorBillingPeriod(month, year, currentMonth, currentYear))
  if (!statusEligible) return false
  if (maxPriorMonths == null) return true

  // A future-dated period is never chased; 0 = the current month (an OVERDUE invoice
  // whose due date has already passed within this month).
  const monthsAgo =
    billingPeriodIndex(currentMonth, currentYear) - billingPeriodIndex(month, year)
  return monthsAgo >= 0 && monthsAgo <= maxPriorMonths
}

/**
 * The billing periods the Phase-2 chase may touch: the current one (for invoices already
 * OVERDUE within this month) plus `maxPriorMonths` before it, newest first.
 *
 * The service turns this into a DB-side filter so the query returns only chaseable rows,
 * keeping the scanned set flat as unpaid history accumulates instead of growing with every
 * month that goes unpaid.
 */
export function chaseWindowPeriods(
  currentMonth: number,
  currentYear: number,
  maxPriorMonths: number
): { month: number; year: number }[] {
  const periods: { month: number; year: number }[] = []
  for (let back = 0; back <= maxPriorMonths; back++) {
    periods.push(shiftBillingPeriod(currentMonth, currentYear, -back))
  }
  return periods
}

/**
 * Most recent successful send for an invoice, or null when it has never been contacted.
 * Any SENT reminder counts — scheduled or catch-up — because the rotation key we want is
 * "who has gone longest without hearing from us", not "who has had a chase row written".
 */
export function latestSentAt(
  reminders: { sent_at: string | null; status: string }[]
): string | null {
  let latest: string | null = null
  for (const r of reminders) {
    if (r.status !== "SENT" || !r.sent_at) continue
    if (latest === null || r.sent_at > latest) latest = r.sent_at
  }
  return latest
}

/**
 * Has this invoice already had a reminder go out on `today` (WIB)?
 *
 * This is the cross-slot half of Phase 1 ↔ Phase 2 deduplication. `processedInvoiceIds`
 * only spans a single invocation, so on a reminder day the ten slots need something
 * durable: Phase 2's `ensureOverdueCatchUpReminder` refuses to write a second row for
 * today, but it recognises "already sent" only by looking for a SENT row dated exactly
 * today. An invoice Phase 1 sent from a row dated *earlier* than today therefore looked
 * uncontacted, and a later slot's chase would insert a fresh catch-up row and message the
 * parent a second time. Comparing the last successful send instead of the row's schedule
 * closes that: one message per invoice per day, whichever phase sends it.
 *
 * `sent_at` is a UTC instant, so it is converted to a WIB calendar day before comparing —
 * a send at 02:00 UTC is already the same WIB day as a 09:00 WIB run.
 *
 * `realToday` matters only when an operator replays a past reminder day with an explicit
 * `date`: the run's logical `today` is then the replayed date while `sent_at` is still
 * stamped from the real clock, so comparing against the logical day alone would report
 * "never contacted" for a message sent moments earlier and message the parent twice. On the
 * scheduled path the two are identical and this collapses to a single comparison.
 */
export function alreadyContactedOn(
  lastSentAt: string | null,
  today: string,
  realToday: string = today
): boolean {
  if (!lastSentAt) return false
  const sentDay = todayInCenterTimezone(new Date(lastSentAt))
  return sentDay === today || sentDay === realToday
}

/**
 * Order chase candidates least-recently-contacted first: never-chased ahead of everyone,
 * then oldest send first, tie-broken by id so the order is total and reproducible.
 *
 * Without this the Phase-2 query came back in PostgREST's physical order and every run
 * truncated at the same point, so the same prefix was chased on every reminder day while
 * the tail was never reached at all. Rotation is what makes a partial run fair: whoever
 * gets cut off this run sorts to the front of the next one.
 */
export function sortChaseCandidates<T extends { id: string; lastChasedAt: string | null }>(
  candidates: T[]
): T[] {
  return [...candidates].sort((a, b) => {
    if (a.lastChasedAt === null && b.lastChasedAt !== null) return -1
    if (a.lastChasedAt !== null && b.lastChasedAt === null) return 1
    if (a.lastChasedAt !== null && b.lastChasedAt !== null) {
      if (a.lastChasedAt < b.lastChasedAt) return -1
      if (a.lastChasedAt > b.lastChasedAt) return 1
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
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
