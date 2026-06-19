import type { LeaveReviewAlert } from "@/features/students/types"

/** Calendar month on temporary leave (1–12). */
export type LeaveMonth = { month: number; year: number }

export const DEFAULT_MAX_CONSECUTIVE_LEAVE_MONTHS = 3

export function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1)
}

export function dedupeLeaveMonths(leaves: LeaveMonth[]): LeaveMonth[] {
  const seen = new Set<number>()
  const out: LeaveMonth[] = []
  for (const l of leaves) {
    const k = monthIndex(l.year, l.month)
    if (!seen.has(k)) {
      seen.add(k)
      out.push({ month: l.month, year: l.year })
    }
  }
  return out.sort((a, b) => monthIndex(a.year, a.month) - monthIndex(b.year, b.month))
}

/** Longest run of adjacent calendar months anywhere in the leave history. */
export function longestConsecutiveLeaveStreak(leaves: LeaveMonth[]): number {
  const sorted = dedupeLeaveMonths(leaves)
  if (sorted.length === 0) return 0

  let max = 1
  let current = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = monthIndex(sorted[i - 1].year, sorted[i - 1].month)
    const curr = monthIndex(sorted[i].year, sorted[i].month)
    if (curr === prev + 1) {
      current++
      max = Math.max(max, current)
    } else {
      current = 1
    }
  }
  return max
}

/** Consecutive months ending at the latest recorded leave month. */
export function currentConsecutiveLeaveStreak(leaves: LeaveMonth[]): number {
  const sorted = dedupeLeaveMonths(leaves)
  if (sorted.length === 0) return 0

  let streak = 1
  for (let i = sorted.length - 1; i > 0; i--) {
    const prev = monthIndex(sorted[i - 1].year, sorted[i - 1].month)
    const curr = monthIndex(sorted[i].year, sorted[i].month)
    if (curr === prev + 1) streak++
    else break
  }
  return streak
}

/** Inclusive period for the streak ending at the latest leave month. */
export function getCurrentLeaveStreakPeriod(
  leaves: LeaveMonth[]
): { start: LeaveMonth; end: LeaveMonth } | null {
  const sorted = dedupeLeaveMonths(leaves)
  if (sorted.length === 0) return null

  const end = sorted[sorted.length - 1]
  let start = end
  for (let i = sorted.length - 1; i > 0; i--) {
    const prev = monthIndex(sorted[i - 1].year, sorted[i - 1].month)
    const curr = monthIndex(sorted[i].year, sorted[i].month)
    if (curr === prev + 1) start = sorted[i - 1]
    else break
  }
  return { start, end }
}

export function needsLeaveReview(leaves: LeaveMonth[], maxConsecutive: number): boolean {
  if (maxConsecutive <= 0) return false
  return currentConsecutiveLeaveStreak(leaves) >= maxConsecutive
}

export function parseMaxLeaveMonthsConfig(value: unknown): number {
  const months = (value as { months?: number } | null)?.months
  return typeof months === "number" && months > 0 ? months : DEFAULT_MAX_CONSECUTIVE_LEAVE_MONTHS
}

/**
 * Builds the leave-review alert for a student's leave history, or `null` when no
 * review is warranted (streak below the limit, or no streak at all). The alert
 * describes the current consecutive streak and its inclusive period.
 */
export function buildLeaveReviewAlert(
  leaves: LeaveMonth[],
  maxConsecutive: number
): LeaveReviewAlert | null {
  if (!needsLeaveReview(leaves, maxConsecutive)) return null
  const period = getCurrentLeaveStreakPeriod(leaves)
  if (!period) return null

  return {
    consecutive_months: currentConsecutiveLeaveStreak(leaves),
    max_consecutive_months: maxConsecutive,
    period_start_month: period.start.month,
    period_start_year: period.start.year,
    period_end_month: period.end.month,
    period_end_year: period.end.year,
  }
}
