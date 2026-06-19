import { describe, it, expect } from "vitest"
import {
  todayInCenterTimezone,
  currentMonthYearInCenterTimezone,
  toDateString,
  lastDayOfMonth,
  dayOfMonthFromDateString,
  monthYearFromDateString,
  isPriorBillingPeriod,
  isSameBillingPeriod,
} from "@/lib/utils"

// The WIB (Asia/Jakarta, UTC+7) invariant is the project's #1 hard rule. These
// tests pin the timezone helpers to fixed UTC instants so a TZ regression fails
// loudly instead of silently mis-dating invoices.
describe("todayInCenterTimezone", () => {
  it("returns the Jakarta calendar day, which can differ from UTC", () => {
    // 23:30 UTC on Jan 31 is already 06:30 on Feb 1 in Jakarta (+7h).
    expect(todayInCenterTimezone(new Date("2026-01-31T23:30:00Z"))).toBe("2026-02-01")
  })

  it("stays on the same day when the instant is mid-day UTC", () => {
    expect(todayInCenterTimezone(new Date("2026-06-17T05:00:00Z"))).toBe("2026-06-17")
  })

  it("rolls the year over at the WIB boundary", () => {
    // 22:00 UTC on Dec 31 2025 → 05:00 Jan 1 2026 WIB.
    expect(todayInCenterTimezone(new Date("2025-12-31T22:00:00Z"))).toBe("2026-01-01")
  })
})

describe("currentMonthYearInCenterTimezone", () => {
  it("reports the Jakarta month/year across a UTC→WIB month rollover", () => {
    expect(currentMonthYearInCenterTimezone(new Date("2026-01-31T23:30:00Z"))).toEqual({
      month: 2,
      year: 2026,
    })
  })

  it("reports the Jakarta month/year across a year rollover", () => {
    expect(currentMonthYearInCenterTimezone(new Date("2025-12-31T22:00:00Z"))).toEqual({
      month: 1,
      year: 2026,
    })
  })
})

describe("lastDayOfMonth", () => {
  it("handles February in a leap year", () => {
    expect(lastDayOfMonth(2024, 2)).toBe(29)
  })

  it("handles February in a non-leap year", () => {
    expect(lastDayOfMonth(2026, 2)).toBe(28)
  })

  it("handles 30- and 31-day months", () => {
    expect(lastDayOfMonth(2026, 4)).toBe(30)
    expect(lastDayOfMonth(2026, 12)).toBe(31)
  })
})

describe("date string parsing", () => {
  it("round-trips toDateString with the parsing helpers", () => {
    const s = toDateString(2026, 2, 7)
    expect(s).toBe("2026-02-07")
    expect(dayOfMonthFromDateString(s)).toBe(7)
    expect(monthYearFromDateString(s)).toEqual({ month: 2, year: 2026 })
  })

  it("zero-pads single-digit months and days", () => {
    expect(toDateString(2026, 3, 5)).toBe("2026-03-05")
  })
})

describe("isPriorBillingPeriod", () => {
  it("is true for an earlier year", () => {
    expect(isPriorBillingPeriod(12, 2025, 1, 2026)).toBe(true)
  })

  it("is true for an earlier month in the same year", () => {
    expect(isPriorBillingPeriod(5, 2026, 6, 2026)).toBe(true)
  })

  it("is false for the same period", () => {
    expect(isPriorBillingPeriod(6, 2026, 6, 2026)).toBe(false)
  })

  it("is false for a later period", () => {
    expect(isPriorBillingPeriod(1, 2026, 12, 2025)).toBe(false)
  })
})

describe("isSameBillingPeriod", () => {
  it("is true only when both month and year match", () => {
    expect(isSameBillingPeriod(6, 2026, 6, 2026)).toBe(true)
  })

  it("is false when the month differs", () => {
    expect(isSameBillingPeriod(5, 2026, 6, 2026)).toBe(false)
    expect(isSameBillingPeriod(7, 2026, 6, 2026)).toBe(false)
  })

  it("is false when the year differs", () => {
    expect(isSameBillingPeriod(6, 2025, 6, 2026)).toBe(false)
  })

  it("is false across the December/January boundary", () => {
    expect(isSameBillingPeriod(12, 2025, 1, 2026)).toBe(false)
    expect(isSameBillingPeriod(1, 2026, 12, 2025)).toBe(false)
  })

  it("is the complement of isPriorBillingPeriod for the current period", () => {
    expect(isSameBillingPeriod(6, 2026, 6, 2026)).toBe(true)
    expect(isPriorBillingPeriod(6, 2026, 6, 2026)).toBe(false)
  })
})
