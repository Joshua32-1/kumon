import { describe, it, expect } from "vitest"
import {
  isRevenueChartPeriod,
  getRevenuePeriodBounds,
  buildRevenueChartSeries,
  summarizeRevenueChart,
  type PaidInvoiceRow,
} from "@/lib/billing/revenue-chart"
import { billingPeriodIndex } from "@/lib/billing/billing-period"

// Fixed "now" → June 2026 in WIB, so period bounds are deterministic.
const NOW = new Date("2026-06-17T05:00:00Z")
const idx = (month: number, year: number) => billingPeriodIndex(month, year)

describe("isRevenueChartPeriod", () => {
  it("guards valid and invalid period strings", () => {
    expect(isRevenueChartPeriod("ytd")).toBe(true)
    expect(isRevenueChartPeriod("all_time")).toBe(true)
    expect(isRevenueChartPeriod("last_week")).toBe(false)
  })
})

describe("getRevenuePeriodBounds", () => {
  it("returns a single month for this_month", () => {
    expect(getRevenuePeriodBounds("this_month", NOW)).toEqual({
      startIndex: idx(6, 2026),
      endIndex: idx(6, 2026),
    })
  })

  it("returns Jan→now for ytd", () => {
    expect(getRevenuePeriodBounds("ytd", NOW)).toEqual({
      startIndex: idx(1, 2026),
      endIndex: idx(6, 2026),
    })
  })

  it("returns a trailing 12-month window for 1_year", () => {
    expect(getRevenuePeriodBounds("1_year", NOW)).toEqual({
      startIndex: idx(7, 2025),
      endIndex: idx(6, 2026),
    })
  })

  it("returns a trailing 36-month window for 3_years", () => {
    expect(getRevenuePeriodBounds("3_years", NOW)).toEqual({
      startIndex: idx(7, 2023),
      endIndex: idx(6, 2026),
    })
  })

  it("uses negative infinity as the lower bound for all_time", () => {
    const { startIndex, endIndex } = getRevenuePeriodBounds("all_time", NOW)
    expect(startIndex).toBe(Number.NEGATIVE_INFINITY)
    expect(endIndex).toBe(idx(6, 2026))
  })
})

describe("buildRevenueChartSeries", () => {
  it("includes only the current month for this_month and sums same-period rows", () => {
    const invoices: PaidInvoiceRow[] = [
      { month: 6, year: 2026, amount: 100 },
      { month: 6, year: 2026, amount: 200 },
      { month: 5, year: 2026, amount: 999 }, // out of range
    ]
    const points = buildRevenueChartSeries(invoices, "this_month", NOW)
    expect(points).toHaveLength(1)
    expect(points[0]).toMatchObject({ month: 6, year: 2026, amount: 300 })
  })

  it("zero-fills gap months across a contiguous range", () => {
    const invoices: PaidInvoiceRow[] = [
      { month: 1, year: 2026, amount: 100 },
      { month: 3, year: 2026, amount: 300 },
    ]
    const points = buildRevenueChartSeries(invoices, "ytd", NOW)
    // Jan..Jun = 6 contiguous buckets.
    expect(points).toHaveLength(6)
    expect(points.map((p) => p.amount)).toEqual([100, 0, 300, 0, 0, 0])
    expect(points.map((p) => p.month)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it("excludes invoices outside the period window", () => {
    const invoices: PaidInvoiceRow[] = [
      { month: 12, year: 2025, amount: 999 }, // before ytd start
      { month: 2, year: 2026, amount: 50 },
    ]
    const total = buildRevenueChartSeries(invoices, "ytd", NOW).reduce((s, p) => s + p.amount, 0)
    expect(total).toBe(50)
  })

  it("anchors all_time to the earliest invoice", () => {
    const invoices: PaidInvoiceRow[] = [
      { month: 11, year: 2025, amount: 10 },
      { month: 6, year: 2026, amount: 20 },
    ]
    const points = buildRevenueChartSeries(invoices, "all_time", NOW)
    expect(points[0]).toMatchObject({ month: 11, year: 2025 })
    expect(points[points.length - 1]).toMatchObject({ month: 6, year: 2026 })
    // Nov 2025 .. Jun 2026 inclusive = 8 buckets.
    expect(points).toHaveLength(8)
  })

  it("falls back to the current month for empty all_time", () => {
    const points = buildRevenueChartSeries([], "all_time", NOW)
    expect(points).toHaveLength(1)
    expect(points[0]).toMatchObject({ month: 6, year: 2026, amount: 0 })
  })
})

describe("summarizeRevenueChart", () => {
  it("totals the point amounts", () => {
    const invoices: PaidInvoiceRow[] = [
      { month: 1, year: 2026, amount: 100 },
      { month: 3, year: 2026, amount: 300 },
    ]
    const summary = summarizeRevenueChart(invoices, "ytd", NOW)
    expect(summary.total).toBe(400)
    expect(summary.period).toBe("ytd")
  })
})
