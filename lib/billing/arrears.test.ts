import { describe, it, expect } from "vitest"
import {
  isArrearsInvoice,
  groupArrearsByPeriod,
  summarizeArrears,
} from "@/lib/billing/arrears"
import { makeInvoice } from "@/lib/test/factories"

const TODAY = "2026-06-18"

describe("isArrearsInvoice", () => {
  it("treats any OVERDUE invoice as arrears", () => {
    expect(isArrearsInvoice(makeInvoice({ status: "OVERDUE", due_date: "2099-01-01" }), TODAY)).toBe(true)
  })

  it("treats a PENDING invoice past its due_date as arrears", () => {
    expect(isArrearsInvoice(makeInvoice({ status: "PENDING", due_date: "2026-05-31" }), TODAY)).toBe(true)
  })

  it("does not treat a PENDING invoice that is not yet due as arrears", () => {
    expect(isArrearsInvoice(makeInvoice({ status: "PENDING", due_date: "2026-06-30" }), TODAY)).toBe(false)
  })

  it("never treats terminal/paid statuses as arrears", () => {
    for (const status of ["PAID", "WAIVED", "CANCELLED", "PAID_OLD_LINK"] as const) {
      expect(isArrearsInvoice(makeInvoice({ status, due_date: "2020-01-01" }), TODAY)).toBe(false)
    }
  })
})

describe("groupArrearsByPeriod", () => {
  it("groups by period, sums amounts, collects ids, and excludes non-arrears", () => {
    const invoices = [
      makeInvoice({ id: "a", month: 4, year: 2026, amount: 100, status: "OVERDUE" }),
      makeInvoice({ id: "b", month: 4, year: 2026, amount: 200, status: "OVERDUE" }),
      makeInvoice({ id: "c", month: 5, year: 2026, amount: 300, status: "PENDING", due_date: "2026-05-31" }),
      // not arrears — excluded
      makeInvoice({ id: "d", month: 6, year: 2026, amount: 999, status: "PENDING", due_date: "2026-06-30" }),
      makeInvoice({ id: "e", month: 3, year: 2026, amount: 999, status: "PAID" }),
    ]
    const groups = groupArrearsByPeriod(invoices, TODAY)
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ month: 4, year: 2026, count: 2, totalAmount: 300, invoiceIds: ["a", "b"] })
    expect(groups[1]).toMatchObject({ month: 5, year: 2026, count: 1, totalAmount: 300, invoiceIds: ["c"] })
  })

  it("sorts periods oldest-first across a year boundary", () => {
    const invoices = [
      makeInvoice({ id: "new", month: 1, year: 2026, status: "OVERDUE" }),
      makeInvoice({ id: "old", month: 12, year: 2025, status: "OVERDUE" }),
    ]
    const groups = groupArrearsByPeriod(invoices, TODAY)
    expect(groups.map((g) => `${g.year}-${g.month}`)).toEqual(["2025-12", "2026-1"])
  })
})

describe("summarizeArrears", () => {
  it("aggregates count/total and reports the oldest period", () => {
    const invoices = [
      makeInvoice({ id: "a", month: 4, year: 2026, amount: 100, status: "OVERDUE" }),
      makeInvoice({ id: "b", month: 5, year: 2026, amount: 250, status: "OVERDUE" }),
    ]
    const summary = summarizeArrears(invoices, TODAY)
    expect(summary.count).toBe(2)
    expect(summary.totalAmount).toBe(350)
    expect(summary.oldest).toMatchObject({ month: 4, year: 2026 })
    expect(summary.byPeriod).toHaveLength(2)
  })

  it("returns an empty summary when there are no arrears", () => {
    const summary = summarizeArrears([makeInvoice({ status: "PAID" })], TODAY)
    expect(summary).toEqual({ count: 0, totalAmount: 0, byPeriod: [], oldest: null })
  })
})
