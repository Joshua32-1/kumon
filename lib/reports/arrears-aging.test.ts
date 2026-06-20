import { describe, it, expect } from "vitest"
import {
  daysOverdue,
  agingBucketForDays,
  buildArrearsAging,
  type ArrearsAgingRow,
} from "@/lib/reports/arrears-aging"

const TODAY = "2026-06-30"

function row(partial: Partial<ArrearsAgingRow> = {}): ArrearsAgingRow {
  return { status: "OVERDUE", due_date: "2026-06-01", amount: 480_000, ...partial }
}

describe("daysOverdue", () => {
  it("counts whole WIB calendar days past the due date", () => {
    expect(daysOverdue("2026-06-20", "2026-06-30")).toBe(10)
    expect(daysOverdue("2026-06-30", "2026-06-30")).toBe(0)
  })

  it("spans month and year boundaries correctly", () => {
    expect(daysOverdue("2025-12-31", "2026-01-31")).toBe(31)
  })
})

describe("agingBucketForDays", () => {
  it("places days at the bucket boundaries correctly", () => {
    expect(agingBucketForDays(0)).toBe("0-30")
    expect(agingBucketForDays(30)).toBe("0-30")
    expect(agingBucketForDays(31)).toBe("31-60")
    expect(agingBucketForDays(60)).toBe("31-60")
    expect(agingBucketForDays(61)).toBe("61-90")
    expect(agingBucketForDays(90)).toBe("61-90")
    expect(agingBucketForDays(91)).toBe("90+")
  })
})

describe("buildArrearsAging", () => {
  it("returns four zeroed buckets for no arrears", () => {
    const r = buildArrearsAging([], TODAY)
    expect(r.count).toBe(0)
    expect(r.totalAmount).toBe(0)
    expect(r.buckets.map((b) => b.key)).toEqual(["0-30", "31-60", "61-90", "90+"])
    expect(r.buckets.every((b) => b.count === 0 && b.totalAmount === 0)).toBe(true)
  })

  it("buckets arrears invoices by age and sums amounts", () => {
    const r = buildArrearsAging(
      [
        row({ due_date: "2026-06-20", amount: 100 }), // 10 days → 0-30
        row({ due_date: "2026-05-20", amount: 200 }), // 41 days → 31-60
        row({ due_date: "2026-03-01", amount: 300 }), // 121 days → 90+
      ],
      TODAY
    )
    expect(r.count).toBe(3)
    expect(r.totalAmount).toBe(600)
    const byKey = Object.fromEntries(r.buckets.map((b) => [b.key, b]))
    expect(byKey["0-30"]).toMatchObject({ count: 1, totalAmount: 100 })
    expect(byKey["31-60"]).toMatchObject({ count: 1, totalAmount: 200 })
    expect(byKey["90+"]).toMatchObject({ count: 1, totalAmount: 300 })
    expect(byKey["61-90"]).toMatchObject({ count: 0, totalAmount: 0 })
  })

  it("ignores non-arrears invoices (PENDING not yet past due, PAID, etc.)", () => {
    const r = buildArrearsAging(
      [
        row({ status: "PENDING", due_date: "2026-07-31", amount: 999 }), // future due → not arrears
        row({ status: "OVERDUE", due_date: "2026-06-01", amount: 100 }),
      ],
      TODAY
    )
    expect(r.count).toBe(1)
    expect(r.totalAmount).toBe(100)
  })

  it("treats PENDING past its due date as arrears", () => {
    const r = buildArrearsAging(
      [row({ status: "PENDING", due_date: "2026-06-01", amount: 150 })],
      TODAY
    )
    expect(r.count).toBe(1)
    expect(r.buckets.find((b) => b.key === "0-30")?.totalAmount).toBe(150)
  })
})
