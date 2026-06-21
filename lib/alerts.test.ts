import { describe, it, expect } from "vitest"
import {
  formatMissingInvoicesAlert,
  formatCronFailureAlert,
  isAlertWorthyError,
} from "@/lib/alerts"
import { AppError, Errors } from "@/lib/errors"

describe("formatMissingInvoicesAlert", () => {
  it("includes the count, period, and each student", () => {
    const { subject, body } = formatMissingInvoicesAlert({
      month: 6,
      year: 2026,
      missing: [
        { id: "stu-1", name: "Ani" },
        { id: "stu-2", name: "Budi" },
      ],
    })
    expect(subject).toContain("2 siswa")
    expect(subject).toContain("2026")
    expect(body).toContain("Ani (stu-1)")
    expect(body).toContain("Budi (stu-2)")
    expect(body).toContain("generate-invoices")
  })
})

describe("formatCronFailureAlert", () => {
  it("names the job and includes the error", () => {
    const { subject, body } = formatCronFailureAlert({
      job: "generate-invoices",
      error: "boom",
    })
    expect(subject).toContain("generate-invoices")
    expect(body).toContain("boom")
  })
})

describe("isAlertWorthyError", () => {
  it("alerts on unexpected (non-AppError) throws", () => {
    expect(isAlertWorthyError(new Error("kaboom"))).toBe(true)
    expect(isAlertWorthyError("string error")).toBe(true)
  })

  it("alerts on 5xx AppErrors", () => {
    expect(isAlertWorthyError(Errors.INTERNAL("db down"))).toBe(true)
    expect(isAlertWorthyError(new AppError("X", "x", 500))).toBe(true)
  })

  it("does NOT alert on benign 4xx control-flow AppErrors", () => {
    expect(isAlertWorthyError(Errors.OUTSIDE_PROMOTION_WINDOW())).toBe(false)
    expect(isAlertWorthyError(Errors.BAD_REQUEST())).toBe(false)
  })
})
