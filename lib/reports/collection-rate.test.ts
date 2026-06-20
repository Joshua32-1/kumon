import { describe, it, expect } from "vitest"
import {
  isPaidStatus,
  isBilledStatus,
  buildCollectionRateSeries,
  summarizeCollectionRate,
  type CollectionInvoiceRow,
} from "@/lib/reports/collection-rate"

// Fixed "now" so period bounds are deterministic: June 2026 WIB.
const NOW = new Date("2026-06-17T05:00:00Z")

function inv(partial: Partial<CollectionInvoiceRow> = {}): CollectionInvoiceRow {
  return { month: 6, year: 2026, amount: 100, status: "PENDING", ...partial }
}

describe("status predicates", () => {
  it("treats PAID and PAID_OLD_LINK as paid", () => {
    expect(isPaidStatus("PAID")).toBe(true)
    expect(isPaidStatus("PAID_OLD_LINK")).toBe(true)
    expect(isPaidStatus("PENDING")).toBe(false)
    expect(isPaidStatus("OVERDUE")).toBe(false)
  })

  it("excludes only CANCELLED and WAIVED from the billed base", () => {
    expect(isBilledStatus("CANCELLED")).toBe(false)
    expect(isBilledStatus("WAIVED")).toBe(false)
    expect(isBilledStatus("PENDING")).toBe(true)
    expect(isBilledStatus("PAID")).toBe(true)
    expect(isBilledStatus("PAID_OLD_LINK")).toBe(true)
  })
})

describe("summarizeCollectionRate", () => {
  it("computes rate as paid / billed for the current month", () => {
    const data = summarizeCollectionRate(
      [
        inv({ amount: 300, status: "PAID" }),
        inv({ amount: 100, status: "PENDING" }),
      ],
      "this_month",
      NOW
    )
    expect(data.billed).toBe(400)
    expect(data.paid).toBe(300)
    expect(data.rate).toBe(0.75)
    expect(data.points).toHaveLength(1)
    expect(data.points[0]).toMatchObject({ month: 6, year: 2026, billed: 400, paid: 300, rate: 0.75 })
  })

  it("counts PAID_OLD_LINK toward paid", () => {
    const data = summarizeCollectionRate(
      [inv({ amount: 100, status: "PAID_OLD_LINK" })],
      "this_month",
      NOW
    )
    expect(data.paid).toBe(100)
    expect(data.rate).toBe(1)
  })

  it("excludes CANCELLED and WAIVED from billed and paid", () => {
    const data = summarizeCollectionRate(
      [
        inv({ amount: 100, status: "PAID" }),
        inv({ amount: 500, status: "CANCELLED" }),
        inv({ amount: 500, status: "WAIVED" }),
      ],
      "this_month",
      NOW
    )
    expect(data.billed).toBe(100)
    expect(data.paid).toBe(100)
    expect(data.rate).toBe(1)
  })

  it("returns rate null when nothing was billed in the period", () => {
    const data = summarizeCollectionRate([], "this_month", NOW)
    expect(data.billed).toBe(0)
    expect(data.rate).toBeNull()
    expect(data.points[0].rate).toBeNull()
  })
})

describe("buildCollectionRateSeries", () => {
  it("produces contiguous month buckets and zero-fills gaps", () => {
    // ytd = Jan..Jun 2026 → 6 points
    const points = buildCollectionRateSeries(
      [inv({ month: 3, year: 2026, amount: 200, status: "PAID" })],
      "ytd",
      NOW
    )
    expect(points).toHaveLength(6)
    expect(points[0]).toMatchObject({ month: 1, year: 2026, billed: 0, rate: null })
    expect(points[2]).toMatchObject({ month: 3, year: 2026, billed: 200, paid: 200, rate: 1 })
  })

  it("anchors all_time to the earliest billed invoice", () => {
    const points = buildCollectionRateSeries(
      [
        inv({ month: 5, year: 2026, amount: 100, status: "PAID" }),
        inv({ month: 6, year: 2026, amount: 100, status: "PENDING" }),
      ],
      "all_time",
      NOW
    )
    expect(points[0]).toMatchObject({ month: 5, year: 2026 })
    expect(points[points.length - 1]).toMatchObject({ month: 6, year: 2026 })
    expect(points).toHaveLength(2)
  })
})
