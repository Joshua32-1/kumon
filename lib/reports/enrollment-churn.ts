import { billingPeriodIndex } from "@/lib/billing/billing-period"
import {
  getRevenuePeriodBounds,
  type RevenueChartPeriod,
} from "@/lib/billing/revenue-chart"
import {
  currentMonthYearInCenterTimezone,
  getMonthName,
  monthYearFromDateString,
} from "@/lib/utils"

// Pure enrollment-vs-churn aggregation: per month, how many students joined
// (enrolled_at) vs. were deactivated (deactivated_at), and the net change.
// Series shape mirrors the revenue chart so the UI reuses the period selector.

export interface StudentLifecycleRow {
  /** DATE (YYYY-MM-DD) — gates billable periods; bucketed by its calendar month. */
  enrolled_at: string
  /** TIMESTAMPTZ (full ISO) or null — bucketed by its WIB month. */
  deactivated_at: string | null
}

export interface EnrollmentChurnPoint {
  month: number
  year: number
  label: string
  joined: number
  churned: number
  net: number
}

export interface EnrollmentChurnData {
  period: RevenueChartPeriod
  joined: number
  churned: number
  net: number
  points: EnrollmentChurnPoint[]
}

function formatChartLabel(month: number, year: number): string {
  return `${getMonthName(month).slice(0, 3)} '${String(year).slice(-2)}`
}

function enrolledIndex(row: StudentLifecycleRow): number {
  const { month, year } = monthYearFromDateString(row.enrolled_at)
  return billingPeriodIndex(month, year)
}

/** WIB-month period index of a deactivation timestamp, or null if still active. */
function churnedIndex(row: StudentLifecycleRow): number | null {
  if (!row.deactivated_at) return null
  const { month, year } = currentMonthYearInCenterTimezone(new Date(row.deactivated_at))
  return billingPeriodIndex(month, year)
}

export function buildEnrollmentChurnSeries(
  rows: StudentLifecycleRow[],
  period: RevenueChartPeriod,
  now = new Date()
): EnrollmentChurnPoint[] {
  const { endIndex } = getRevenuePeriodBounds(period, now)
  let { startIndex } = getRevenuePeriodBounds(period, now)

  const joinedIdx = rows.map(enrolledIndex)
  const churnedIdx = rows
    .map(churnedIndex)
    .filter((idx): idx is number => idx !== null)

  if (period === "all_time") {
    const all = [...joinedIdx, ...churnedIdx]
    if (all.length === 0) {
      const { month, year } = currentMonthYearInCenterTimezone(now)
      startIndex = billingPeriodIndex(month, year)
    } else {
      startIndex = Math.min(...all)
    }
  }

  const joinedByIdx = new Map<number, number>()
  for (const idx of joinedIdx) {
    if (idx < startIndex || idx > endIndex) continue
    joinedByIdx.set(idx, (joinedByIdx.get(idx) ?? 0) + 1)
  }
  const churnedByIdx = new Map<number, number>()
  for (const idx of churnedIdx) {
    if (idx < startIndex || idx > endIndex) continue
    churnedByIdx.set(idx, (churnedByIdx.get(idx) ?? 0) + 1)
  }

  const points: EnrollmentChurnPoint[] = []
  for (let idx = startIndex; idx <= endIndex; idx++) {
    const y = Math.floor((idx - 1) / 12)
    const m = ((idx - 1) % 12) + 1
    const joined = joinedByIdx.get(idx) ?? 0
    const churned = churnedByIdx.get(idx) ?? 0
    points.push({
      month: m,
      year: y,
      label: formatChartLabel(m, y),
      joined,
      churned,
      net: joined - churned,
    })
  }

  return points
}

export function summarizeEnrollmentChurn(
  rows: StudentLifecycleRow[],
  period: RevenueChartPeriod,
  now = new Date()
): EnrollmentChurnData {
  const points = buildEnrollmentChurnSeries(rows, period, now)
  const joined = points.reduce((s, p) => s + p.joined, 0)
  const churned = points.reduce((s, p) => s + p.churned, 0)
  return { period, joined, churned, net: joined - churned, points }
}
