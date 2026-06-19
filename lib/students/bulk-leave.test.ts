import { describe, it, expect } from "vitest"
import { buildSetLeaveBulkResult } from "@/lib/students/bulk-leave"
import { makeBulkInvoiceRow } from "@/lib/test/factories"

describe("buildSetLeaveBulkResult", () => {
  describe("count arithmetic", () => {
    it("derives skipped_ineligible and skipped_existing from the three counts", () => {
      // 5 requested, 3 eligible, 2 newly created.
      const result = buildSetLeaveBulkResult({
        studentIds: ["a", "b", "c", "d", "e"],
        eligibleIds: ["a", "b", "c"],
        created: 2,
        invoiceRows: [],
      })
      expect(result.created).toBe(2)
      expect(result.skipped_ineligible).toBe(2) // 5 - 3
      expect(result.skipped_existing).toBe(1) // 3 - 2
    })

    it("reports all requested as ineligible when none are eligible", () => {
      const result = buildSetLeaveBulkResult({
        studentIds: ["a", "b", "c", "d"],
        eligibleIds: [],
        created: 0,
        invoiceRows: [],
      })
      expect(result.skipped_ineligible).toBe(4)
      expect(result.skipped_existing).toBe(0)
      expect(result.created).toBe(0)
    })

    it("reports all eligible as existing when nothing was created", () => {
      const result = buildSetLeaveBulkResult({
        studentIds: ["a", "b", "c"],
        eligibleIds: ["a", "b", "c"],
        created: 0,
        invoiceRows: [],
      })
      expect(result.skipped_existing).toBe(3)
      expect(result.skipped_ineligible).toBe(0)
    })
  })

  describe("invoice categorization", () => {
    it("splits invoices into unpaid (PENDING/OVERDUE) and paid (PAID)", () => {
      const result = buildSetLeaveBulkResult({
        studentIds: ["a", "b", "c"],
        eligibleIds: ["a", "b", "c"],
        created: 3,
        invoiceRows: [
          makeBulkInvoiceRow({ id: "i1", student_id: "a", status: "PENDING" }),
          makeBulkInvoiceRow({ id: "i2", student_id: "b", status: "OVERDUE" }),
          makeBulkInvoiceRow({ id: "i3", student_id: "c", status: "PAID" }),
        ],
      })
      expect(result.unpaid_invoices.map((i) => i.invoice_id)).toEqual(["i1", "i2"])
      expect(result.paid_invoices.map((i) => i.invoice_id)).toEqual(["i3"])
      // cancelled is always empty here — filled by the action layer.
      expect(result.cancelled_invoices).toEqual([])
    })

    it("maps invoice fields and reads the embedded student name", () => {
      const result = buildSetLeaveBulkResult({
        studentIds: ["a"],
        eligibleIds: ["a"],
        created: 1,
        invoiceRows: [
          makeBulkInvoiceRow({
            id: "i1",
            student_id: "a",
            amount: 530_000,
            status: "PENDING",
            students: { full_name: "Siti Rahma" },
          }),
        ],
      })
      expect(result.unpaid_invoices[0]).toEqual({
        invoice_id: "i1",
        student_id: "a",
        student_name: "Siti Rahma",
        amount: 530_000,
        status: "PENDING",
      })
    })

    it("falls back to an empty student name when the relation is null", () => {
      const result = buildSetLeaveBulkResult({
        studentIds: ["a"],
        eligibleIds: ["a"],
        created: 1,
        invoiceRows: [makeBulkInvoiceRow({ status: "OVERDUE", students: null })],
      })
      expect(result.unpaid_invoices[0].student_name).toBe("")
    })

    it("produces empty invoice arrays when there are no invoice rows", () => {
      const result = buildSetLeaveBulkResult({
        studentIds: ["a"],
        eligibleIds: ["a"],
        created: 1,
        invoiceRows: [],
      })
      expect(result.unpaid_invoices).toEqual([])
      expect(result.paid_invoices).toEqual([])
    })
  })
})
