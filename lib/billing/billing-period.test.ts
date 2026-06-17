import { describe, it, expect } from "vitest"
import {
  billingPeriodIndex,
  isBillingPeriodBeforeEnrollment,
  isPastBillingPeriod,
  filterSubjectsForBillingPeriod,
} from "@/lib/billing/billing-period"
import type { KumonSubject } from "@/lib/billing/fees"

describe("billingPeriodIndex", () => {
  it("orders periods monotonically across year boundaries", () => {
    expect(billingPeriodIndex(12, 2025)).toBeLessThan(billingPeriodIndex(1, 2026))
  })

  it("is equal for the same period", () => {
    expect(billingPeriodIndex(6, 2026)).toBe(billingPeriodIndex(6, 2026))
  })
})

describe("isBillingPeriodBeforeEnrollment", () => {
  const enrolledAt = "2026-03-01" // March 2026

  it("is true for a period before the enrollment month", () => {
    expect(isBillingPeriodBeforeEnrollment(enrolledAt, 2, 2026)).toBe(true)
  })

  it("is false for the enrollment month itself", () => {
    expect(isBillingPeriodBeforeEnrollment(enrolledAt, 3, 2026)).toBe(false)
  })

  it("is false for a period after the enrollment month", () => {
    expect(isBillingPeriodBeforeEnrollment(enrolledAt, 4, 2026)).toBe(false)
  })

  it("ignores the day-of-month, keying on the calendar month", () => {
    // Enrolled on the 28th — March billing is still on-or-after enrollment.
    expect(isBillingPeriodBeforeEnrollment("2026-03-28", 3, 2026)).toBe(false)
  })
})

describe("isPastBillingPeriod", () => {
  const now = new Date("2026-06-17T05:00:00Z") // June 2026 WIB

  it("is true for a prior month", () => {
    expect(isPastBillingPeriod(5, 2026, now)).toBe(true)
  })

  it("is false for the current month", () => {
    expect(isPastBillingPeriod(6, 2026, now)).toBe(false)
  })

  it("is false for a future month", () => {
    expect(isPastBillingPeriod(7, 2026, now)).toBe(false)
  })
})

describe("filterSubjectsForBillingPeriod", () => {
  const subjects: { subject: KumonSubject; enrolled_at: string }[] = [
    { subject: "ENGLISH", enrolled_at: "2026-01-01" },
    { subject: "MATHEMATICS", enrolled_at: "2026-06-01" },
    { subject: "INDONESIAN", enrolled_at: "2026-08-01" },
  ]

  it("drops subjects enrolled after the billing period", () => {
    const result = filterSubjectsForBillingPeriod(subjects, 6, 2026)
    expect(result.map((s) => s.subject)).toEqual(["ENGLISH", "MATHEMATICS"])
  })

  it("keeps all subjects when the period is on/after every enrollment", () => {
    const result = filterSubjectsForBillingPeriod(subjects, 8, 2026)
    expect(result).toHaveLength(3)
  })

  it("drops everything when the period precedes all enrollments", () => {
    const result = filterSubjectsForBillingPeriod(subjects, 12, 2025)
    expect(result).toHaveLength(0)
  })
})
