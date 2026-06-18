import { describe, it, expect } from "vitest"
import {
  generateMonthlySchema,
  updateInvoiceSchema,
  resolvePaidLeaveConflictSchema,
} from "@/features/payments/validations"

describe("generateMonthlySchema", () => {
  it("accepts a valid month/year with optional fields omitted", () => {
    expect(generateMonthlySchema.safeParse({ month: 6, year: 2026 }).success).toBe(true)
  })

  it("rejects out-of-range months and years", () => {
    expect(generateMonthlySchema.safeParse({ month: 0, year: 2026 }).success).toBe(false)
    expect(generateMonthlySchema.safeParse({ month: 13, year: 2026 }).success).toBe(false)
    expect(generateMonthlySchema.safeParse({ month: 6, year: 2019 }).success).toBe(false)
    expect(generateMonthlySchema.safeParse({ month: 6, year: 2101 }).success).toBe(false)
  })

  it("rejects non-uuid student_ids", () => {
    expect(
      generateMonthlySchema.safeParse({ month: 6, year: 2026, student_ids: ["not-a-uuid"] }).success
    ).toBe(false)
  })

  it("accepts valid categories and student_ids", () => {
    const result = generateMonthlySchema.safeParse({
      month: 6,
      year: 2026,
      categories: ["no_invoice", "CANCELLED"],
      student_ids: ["11111111-1111-4111-8111-111111111111"],
    })
    expect(result.success).toBe(true)
  })
})

describe("updateInvoiceSchema", () => {
  it("accepts a known status", () => {
    expect(updateInvoiceSchema.safeParse({ status: "PAID" }).success).toBe(true)
  })

  it("rejects PAID_OLD_LINK (not an admin-settable status)", () => {
    expect(updateInvoiceSchema.safeParse({ status: "PAID_OLD_LINK" }).success).toBe(false)
  })
})

describe("resolvePaidLeaveConflictSchema", () => {
  it("requires a uuid invoice_id", () => {
    expect(resolvePaidLeaveConflictSchema.safeParse({ invoice_id: "nope" }).success).toBe(false)
    expect(
      resolvePaidLeaveConflictSchema.safeParse({
        invoice_id: "11111111-1111-4111-8111-111111111111",
      }).success
    ).toBe(true)
  })
})
