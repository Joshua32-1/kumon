import {
  DEFAULT_SUBJECT_FEES,
  parseSubjectFees,
  type SubjectFeeConfig,
} from "@/lib/billing/fees"
import { billingPeriodIndex } from "@/lib/billing/billing-period"
import { currentMonthYearInCenterTimezone } from "@/lib/utils"

export interface FeeScheduleEntry {
  year: number
  month: number
  fees: SubjectFeeConfig
}

export function parseFeeSchedule(value: unknown): FeeScheduleEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null
      const r = row as Record<string, unknown>
      const year = Number(r.year)
      const month = Number(r.month)
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return null
      }
      return {
        year,
        month,
        fees: parseSubjectFees(r.fees as Record<string, unknown>),
      }
    })
    .filter((e): e is FeeScheduleEntry => e !== null)
    .sort(
      (a, b) =>
        billingPeriodIndex(a.month, a.year) - billingPeriodIndex(b.month, b.year)
    )
}

export function feesEqual(a: SubjectFeeConfig, b: SubjectFeeConfig): boolean {
  for (const tier of ["elementary", "secondary"] as const) {
    for (const subject of ["english", "indonesian", "mathematics"] as const) {
      if (a[tier][subject] !== b[tier][subject]) return false
    }
  }
  return true
}

/** Latest schedule entry effective on or before the billing period; else fallback. */
export function resolveFeesForPeriod(
  schedule: FeeScheduleEntry[],
  billingMonth: number,
  billingYear: number,
  fallback: SubjectFeeConfig = DEFAULT_SUBJECT_FEES
): SubjectFeeConfig {
  const target = billingPeriodIndex(billingMonth, billingYear)
  let best: FeeScheduleEntry | null = null
  let bestIndex = -1

  for (const entry of schedule) {
    const idx = billingPeriodIndex(entry.month, entry.year)
    if (idx <= target && idx >= bestIndex) {
      best = entry
      bestIndex = idx
    }
  }

  return best?.fees ?? fallback
}

export function findEffectiveFeeScheduleEntry(
  schedule: FeeScheduleEntry[],
  billingMonth: number,
  billingYear: number
): FeeScheduleEntry | null {
  const fees = resolveFeesForPeriod(schedule, billingMonth, billingYear, DEFAULT_SUBJECT_FEES)
  const target = billingPeriodIndex(billingMonth, billingYear)
  let best: FeeScheduleEntry | null = null
  let bestIndex = -1
  for (const entry of schedule) {
    const idx = billingPeriodIndex(entry.month, entry.year)
    if (idx <= target && idx >= bestIndex && feesEqual(entry.fees, fees)) {
      best = entry
      bestIndex = idx
    }
  }
  return best
}

export function appendFeeScheduleEntry(
  schedule: FeeScheduleEntry[],
  month: number,
  year: number,
  fees: SubjectFeeConfig
): FeeScheduleEntry[] {
  const normalized = parseSubjectFees(fees as unknown as Record<string, unknown>)
  const withoutSamePeriod = schedule.filter((e) => !(e.year === year && e.month === month))
  const sameAsPrevious =
    withoutSamePeriod.length > 0 &&
    feesEqual(withoutSamePeriod[withoutSamePeriod.length - 1]!.fees, normalized)
  if (sameAsPrevious) return schedule

  return [...withoutSamePeriod, { year, month, fees: normalized }].sort(
    (a, b) => billingPeriodIndex(a.month, a.year) - billingPeriodIndex(b.month, b.year)
  )
}

export function buildInitialFeeSchedule(fees: SubjectFeeConfig): FeeScheduleEntry[] {
  return [{ year: 2020, month: 1, fees: parseSubjectFees(fees as unknown as Record<string, unknown>) }]
}

export function feeScheduleEntryForCurrentMonth(
  fees: SubjectFeeConfig,
  now = new Date()
): FeeScheduleEntry {
  const { month, year } = currentMonthYearInCenterTimezone(now)
  return { month, year, fees: parseSubjectFees(fees as unknown as Record<string, unknown>) }
}
