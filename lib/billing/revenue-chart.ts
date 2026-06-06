import { billingPeriodIndex } from "@/lib/billing/billing-period"
import { currentMonthYearInCenterTimezone, getMonthName } from "@/lib/utils"

export type RevenueChartPeriod =
  | "all_time"
  | "3_years"
  | "1_year"
  | "ytd"
  | "this_month"

export const REVENUE_CHART_PERIODS: RevenueChartPeriod[] = [
  "all_time",
  "3_years",
  "1_year",
  "ytd",
  "this_month",
]

export const REVENUE_PERIOD_LABELS: Record<RevenueChartPeriod, string> = {
  all_time: "Semua waktu",
  "3_years": "3 tahun",
  "1_year": "1 tahun",
  ytd: "YTD",
  this_month: "Bulan ini",
}

export interface PaidInvoiceRow {
  month: number
  year: number
  amount: number
}

export interface RevenueChartPoint {
  month: number
  year: number
  label: string
  amount: number
}

export interface RevenueChartData {
  period: RevenueChartPeriod
  total: number
  points: RevenueChartPoint[]
}

function shiftBillingPeriod(
  month: number,
  year: number,
  deltaMonths: number
): { month: number; year: number } {
  const idx = billingPeriodIndex(month, year) + deltaMonths
  return {
    year: Math.floor((idx - 1) / 12),
    month: ((idx - 1) % 12) + 1,
  }
}

export function isRevenueChartPeriod(value: string): value is RevenueChartPeriod {
  return REVENUE_CHART_PERIODS.includes(value as RevenueChartPeriod)
}

function formatChartLabel(month: number, year: number): string {
  const shortYear = String(year).slice(-2)
  return `${getMonthName(month).slice(0, 3)} '${shortYear}`
}

export function getRevenuePeriodBounds(
  period: RevenueChartPeriod,
  now = new Date()
): { startIndex: number; endIndex: number } {
  const { month, year } = currentMonthYearInCenterTimezone(now)
  const endIndex = billingPeriodIndex(month, year)

  switch (period) {
    case "this_month":
      return { startIndex: endIndex, endIndex }
    case "ytd":
      return { startIndex: billingPeriodIndex(1, year), endIndex }
    case "1_year": {
      const start = shiftBillingPeriod(month, year, -11)
      return {
        startIndex: billingPeriodIndex(start.month, start.year),
        endIndex,
      }
    }
    case "3_years": {
      const start = shiftBillingPeriod(month, year, -35)
      return {
        startIndex: billingPeriodIndex(start.month, start.year),
        endIndex,
      }
    }
    case "all_time":
      return { startIndex: Number.NEGATIVE_INFINITY, endIndex }
  }
}

export function buildRevenueChartSeries(
  invoices: PaidInvoiceRow[],
  period: RevenueChartPeriod,
  now = new Date()
): RevenueChartPoint[] {
  const { endIndex } = getRevenuePeriodBounds(period, now)
  let { startIndex } = getRevenuePeriodBounds(period, now)

  if (period === "all_time") {
    if (invoices.length === 0) {
      const { month, year } = currentMonthYearInCenterTimezone(now)
      startIndex = billingPeriodIndex(month, year)
    } else {
      startIndex = Math.min(
        ...invoices.map((inv) => billingPeriodIndex(inv.month, inv.year))
      )
    }
  }

  const amounts = new Map<number, number>()
  for (const inv of invoices) {
    const idx = billingPeriodIndex(inv.month, inv.year)
    if (idx < startIndex || idx > endIndex) continue
    amounts.set(idx, (amounts.get(idx) ?? 0) + inv.amount)
  }

  const points: RevenueChartPoint[] = []
  for (let idx = startIndex; idx <= endIndex; idx++) {
    const y = Math.floor((idx - 1) / 12)
    const m = ((idx - 1) % 12) + 1
    points.push({
      month: m,
      year: y,
      label: formatChartLabel(m, y),
      amount: amounts.get(idx) ?? 0,
    })
  }

  return points
}

export function summarizeRevenueChart(
  invoices: PaidInvoiceRow[],
  period: RevenueChartPeriod,
  now = new Date()
): RevenueChartData {
  const points = buildRevenueChartSeries(invoices, period, now)
  const total = points.reduce((sum, point) => sum + point.amount, 0)
  return { period, total, points }
}
