import { describe, it, expect } from "vitest"
import { evaluatePayPageAccess } from "@/lib/payments/pay-page"

describe("evaluatePayPageAccess", () => {
  it("shows a paid message for PAID and PAID_OLD_LINK", () => {
    for (const invoiceStatus of ["PAID", "PAID_OLD_LINK"] as const) {
      const r = evaluatePayPageAccess({ invoiceStatus, hasLeaveForPeriod: false })
      expect(r.kind).toBe("message")
      if (r.kind === "message") expect(r.title).toBe("Sudah lunas")
    }
  })

  it("distinguishes cuti from a manual cancel for CANCELLED invoices", () => {
    const cuti = evaluatePayPageAccess({ invoiceStatus: "CANCELLED", hasLeaveForPeriod: true })
    expect(cuti).toMatchObject({ kind: "message", title: "Siswa sedang cuti" })

    const cancelled = evaluatePayPageAccess({ invoiceStatus: "CANCELLED", hasLeaveForPeriod: false })
    expect(cancelled).toMatchObject({ kind: "message", title: "Tagihan dibatalkan" })
  })

  it("shows a waived message for WAIVED", () => {
    const r = evaluatePayPageAccess({ invoiceStatus: "WAIVED", hasLeaveForPeriod: false })
    expect(r).toMatchObject({ kind: "message", title: "Tagihan dibebaskan" })
  })

  it("proceeds for PENDING/OVERDUE with a billable student", () => {
    for (const invoiceStatus of ["PENDING", "OVERDUE"] as const) {
      expect(
        evaluatePayPageAccess({ invoiceStatus, hasLeaveForPeriod: false, studentStatus: "ACTIVE" })
      ).toEqual({ kind: "proceed" })
      expect(
        evaluatePayPageAccess({ invoiceStatus, hasLeaveForPeriod: false, studentStatus: "TEMPORARY_LEAVE" })
      ).toEqual({ kind: "proceed" })
    }
  })

  it("blocks payment when the student is inactive or unknown", () => {
    const inactive = evaluatePayPageAccess({
      invoiceStatus: "PENDING",
      hasLeaveForPeriod: false,
      studentStatus: "WITHDRAWN",
    })
    expect(inactive).toMatchObject({ kind: "message", title: "Tidak dapat membayar" })

    const missing = evaluatePayPageAccess({ invoiceStatus: "OVERDUE", hasLeaveForPeriod: false })
    expect(missing).toMatchObject({ kind: "message", title: "Tidak dapat membayar" })
  })
})
