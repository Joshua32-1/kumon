import { describe, it, expect } from "vitest"
import { findMissingInvoices, type WatchdogStudent } from "@/lib/billing/watchdog"
import type { InvoiceStatusRow } from "@/lib/billing/generate-eligibility"

const MONTH = 6
const YEAR = 2026

function student(partial: Partial<WatchdogStudent> = {}): WatchdogStudent {
  return {
    id: "stu-1",
    full_name: "Ani",
    enrolled_at: "2026-01-01",
    student_subjects: [{ subject: "MATHEMATICS", enrolled_at: "2026-01-01" }],
    ...partial,
  }
}

function run(
  students: WatchdogStudent[],
  opts: { invoices?: Record<string, InvoiceStatusRow[]>; onLeave?: string[] } = {}
) {
  return findMissingInvoices({
    students,
    invoicesByStudent: new Map(Object.entries(opts.invoices ?? {})),
    onLeaveIds: new Set(opts.onLeave ?? []),
    month: MONTH,
    year: YEAR,
  })
}

describe("findMissingInvoices", () => {
  it("flags an eligible student with no invoice", () => {
    expect(run([student()])).toEqual([{ id: "stu-1", name: "Ani" }])
  })

  it("does not flag a student on leave this period", () => {
    expect(run([student()], { onLeave: ["stu-1"] })).toEqual([])
  })

  it("does not flag a student enrolled after the billing period", () => {
    expect(run([student({ enrolled_at: "2026-07-01" })])).toEqual([])
  })

  it("does not flag a student with no billable subjects", () => {
    expect(run([student({ student_subjects: [] })])).toEqual([])
  })

  it("does not flag a student who already has an active (PENDING) invoice", () => {
    expect(
      run([student()], {
        invoices: {
          "stu-1": [{ student_id: "stu-1", status: "PENDING", created_at: "2026-06-01" }],
        },
      })
    ).toEqual([])
  })

  it("flags a student whose only invoice is CANCELLED (no active invoice)", () => {
    expect(
      run([student()], {
        invoices: {
          "stu-1": [{ student_id: "stu-1", status: "CANCELLED", created_at: "2026-06-01" }],
        },
      })
    ).toEqual([{ id: "stu-1", name: "Ani" }])
  })

  it("returns only the missing students from a mixed batch", () => {
    const students = [
      student({ id: "a", full_name: "A" }), // missing
      student({ id: "b", full_name: "B" }), // on leave
      student({ id: "c", full_name: "C" }), // has invoice
      student({ id: "d", full_name: "D" }), // missing
    ]
    const missing = run(students, {
      onLeave: ["b"],
      invoices: {
        c: [{ student_id: "c", status: "PAID", created_at: "2026-06-01" }],
      },
    })
    expect(missing.map((m) => m.id)).toEqual(["a", "d"])
  })

  it("is empty when every eligible student has an invoice (healthy)", () => {
    const students = [student({ id: "a", full_name: "A" }), student({ id: "b", full_name: "B" })]
    const missing = run(students, {
      invoices: {
        a: [{ student_id: "a", status: "PENDING", created_at: "2026-06-01" }],
        b: [{ student_id: "b", status: "PAID", created_at: "2026-06-01" }],
      },
    })
    expect(missing).toEqual([])
  })
})
