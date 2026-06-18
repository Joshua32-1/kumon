import { describe, it, expect } from "vitest"
import {
  getStudentSubjects,
  evaluateStudentBillingEligibility,
  getEffectiveInvoiceStatus,
  invoiceStatusToCategory,
  canGenerateInvoiceForStudent,
  studentMatchesGenerateCategories,
  type InvoiceStatusRow,
  type StudentSubjectRow,
} from "@/lib/billing/generate-eligibility"

const subjects: StudentSubjectRow[] = [
  { subject: "ENGLISH", enrolled_at: "2026-01-01" },
  { subject: "MATHEMATICS", enrolled_at: "2026-06-01" },
]

describe("getStudentSubjects", () => {
  it("projects student_subjects, defaulting null to empty", () => {
    expect(getStudentSubjects({ student_subjects: subjects })).toEqual(subjects)
    expect(getStudentSubjects({ student_subjects: null })).toEqual([])
    expect(getStudentSubjects({})).toEqual([])
  })
})

describe("evaluateStudentBillingEligibility", () => {
  const base = { enrolledAt: "2026-01-01", subjects, billingMonth: 6, billingYear: 2026, onLeave: false, invoiceStatus: null }

  it("is eligible for an active student with billable subjects and no invoice", () => {
    const r = evaluateStudentBillingEligibility(base)
    expect(r).toMatchObject({ beforeEnrollment: false, hasSubjects: true, canGenerate: true })
    expect(r.billableSubjects).toHaveLength(2)
  })

  it("is not eligible before enrollment (and bills no subjects)", () => {
    const r = evaluateStudentBillingEligibility({ ...base, enrolledAt: "2026-09-01", billingMonth: 6, billingYear: 2026 })
    expect(r).toMatchObject({ beforeEnrollment: true, hasSubjects: false, canGenerate: false })
    expect(r.billableSubjects).toEqual([])
  })

  it("filters out subjects enrolled after the billing period", () => {
    const r = evaluateStudentBillingEligibility({ ...base, billingMonth: 3, billingYear: 2026 })
    // MATHEMATICS enrolled 2026-06 → excluded for March.
    expect(r.billableSubjects.map((s) => s.subject)).toEqual(["ENGLISH"])
    expect(r.canGenerate).toBe(true)
  })

  it("is not eligible while on leave or with no subjects", () => {
    expect(evaluateStudentBillingEligibility({ ...base, onLeave: true }).canGenerate).toBe(false)
    expect(
      evaluateStudentBillingEligibility({ ...base, subjects: [] }).canGenerate
    ).toBe(false)
  })
})

describe("getEffectiveInvoiceStatus", () => {
  const row = (status: InvoiceStatusRow["status"], created_at: string): InvoiceStatusRow => ({
    student_id: "s1",
    status,
    created_at,
  })

  it("returns null for no invoices", () => {
    expect(getEffectiveInvoiceStatus([])).toBeNull()
  })

  it("prefers a non-blocking status over CANCELLED/PAID_OLD_LINK", () => {
    const status = getEffectiveInvoiceStatus([
      row("CANCELLED", "2026-06-01"),
      row("PENDING", "2026-06-02"),
    ])
    expect(status).toBe("PENDING")
  })

  it("falls back to the most recent when all are blocking", () => {
    const status = getEffectiveInvoiceStatus([
      row("CANCELLED", "2026-06-01"),
      row("PAID_OLD_LINK", "2026-06-05"),
    ])
    expect(status).toBe("PAID_OLD_LINK")
  })
})

describe("invoiceStatusToCategory", () => {
  it("maps null to no_invoice and passes through statuses", () => {
    expect(invoiceStatusToCategory(null)).toBe("no_invoice")
    expect(invoiceStatusToCategory("PAID")).toBe("PAID")
  })
})

describe("canGenerateInvoiceForStudent", () => {
  it("requires subjects, not-on-leave, and a generatable category", () => {
    expect(canGenerateInvoiceForStudent({ onLeave: false, hasSubjects: true, invoiceStatus: null })).toBe(true)
    expect(canGenerateInvoiceForStudent({ onLeave: false, hasSubjects: true, invoiceStatus: "CANCELLED" })).toBe(true)
    // PENDING/PAID already exist → not regeneratable
    expect(canGenerateInvoiceForStudent({ onLeave: false, hasSubjects: true, invoiceStatus: "PAID" })).toBe(false)
    expect(canGenerateInvoiceForStudent({ onLeave: true, hasSubjects: true, invoiceStatus: null })).toBe(false)
    expect(canGenerateInvoiceForStudent({ onLeave: false, hasSubjects: false, invoiceStatus: null })).toBe(false)
  })
})

describe("studentMatchesGenerateCategories", () => {
  it("matches the invoice status against the selected categories", () => {
    expect(studentMatchesGenerateCategories(null, ["no_invoice"])).toBe(true)
    expect(studentMatchesGenerateCategories("PAID", ["no_invoice"])).toBe(false)
    expect(studentMatchesGenerateCategories("CANCELLED", ["CANCELLED", "no_invoice"])).toBe(true)
  })
})
