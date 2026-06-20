import { billingPeriodIndex } from "@/lib/billing/billing-period"
import {
  getRevenuePeriodBounds,
  type RevenueChartPeriod,
} from "@/lib/billing/revenue-chart"
import { currentMonthYearInCenterTimezone, getMonthName } from "@/lib/utils"
import type { PaymentStatus } from "@/features/payments/types"

// Pure collection-rate aggregation: per billing period, what fraction of the
// billed amount was actually collected. Mirrors the revenue-chart series shape
// (contiguous month buckets over the selected period) so the UI can reuse the
// same period selector + chart pattern.

export interface CollectionInvoiceRow {
  month: number
  year: number
  amount: number
  status: PaymentStatus
}

export interface CollectionRatePoint {
  month: number
  year: number
  label: string
  billed: number
  paid: number
  /** paid / billed, or null when nothing was billed that period (render "—"). */
  rate: number | null
}

export interface CollectionRateData {
  period: RevenueChartPeriod
  billed: number
  paid: number
  rate: number | null
  points: CollectionRatePoint[]
}

/** Settled toward collection (incl. payments via a superseded "old" link). */
export function isPaidStatus(status: PaymentStatus): boolean {
  return status === "PAID" || status === "PAID_OLD_LINK"
}

/** Counts toward the billed base — everything except cancelled/waived. */
export function isBilledStatus(status: PaymentStatus): boolean {
  return status !== "CANCELLED" && status !== "WAIVED"
}

function formatChartLabel(month: number, year: number): string {
  return `${getMonthName(month).slice(0, 3)} '${String(year).slice(-2)}`
}

function rateOf(paid: number, billed: number): number | null {
  return billed > 0 ? paid / billed : null
}

export function buildCollectionRateSeries(
  invoices: CollectionInvoiceRow[],
  period: RevenueChartPeriod,
  now = new Date()
): CollectionRatePoint[] {
  const { endIndex } = getRevenuePeriodBounds(period, now)
  let { startIndex } = getRevenuePeriodBounds(period, now)

  const billedRows = invoices.filter((inv) => isBilledStatus(inv.status))

  if (period === "all_time") {
    if (billedRows.length === 0) {
      const { month, year } = currentMonthYearInCenterTimezone(now)
      startIndex = billingPeriodIndex(month, year)
    } else {
      startIndex = Math.min(
        ...billedRows.map((inv) => billingPeriodIndex(inv.month, inv.year))
      )
    }
  }

  const billedByIdx = new Map<number, number>()
  const paidByIdx = new Map<number, number>()
  for (const inv of billedRows) {
    const idx = billingPeriodIndex(inv.month, inv.year)
    if (idx < startIndex || idx > endIndex) continue
    billedByIdx.set(idx, (billedByIdx.get(idx) ?? 0) + inv.amount)
    if (isPaidStatus(inv.status)) {
      paidByIdx.set(idx, (paidByIdx.get(idx) ?? 0) + inv.amount)
    }
  }

  const points: CollectionRatePoint[] = []
  for (let idx = startIndex; idx <= endIndex; idx++) {
    const y = Math.floor((idx - 1) / 12)
    const m = ((idx - 1) % 12) + 1
    const billed = billedByIdx.get(idx) ?? 0
    const paid = paidByIdx.get(idx) ?? 0
    points.push({
      month: m,
      year: y,
      label: formatChartLabel(m, y),
      billed,
      paid,
      rate: rateOf(paid, billed),
    })
  }

  return points
}

export function summarizeCollectionRate(
  invoices: CollectionInvoiceRow[],
  period: RevenueChartPeriod,
  now = new Date()
): CollectionRateData {
  const points = buildCollectionRateSeries(invoices, period, now)
  const billed = points.reduce((sum, p) => sum + p.billed, 0)
  const paid = points.reduce((sum, p) => sum + p.paid, 0)
  return { period, billed, paid, rate: rateOf(paid, billed), points }
}
