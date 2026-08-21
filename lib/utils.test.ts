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
  shiftDateString,
  escapeHtml,
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

describe("escapeHtml", () => {
  it("encodes the HTML-significant characters", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    )
    expect(escapeHtml("a & b")).toBe("a &amp; b")
    expect(escapeHtml("it's")).toBe("it&#39;s")
  })

  it("escapes & first so existing entities are not double-decoded", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;")
  })

  it("leaves plain text unchanged", () => {
    expect(escapeHtml("Tagihan sudah lunas")).toBe("Tagihan sudah lunas")
  })
})

// Calendar-day arithmetic on an already-WIB date string. The reminder retry window is
// measured with this, so an off-by-one or a DST/tz wobble would silently change which
// FAILED reminders still get retried.
describe("shiftDateString", () => {
  it("moves forward and backward inside a month", () => {
    expect(shiftDateString("2026-06-15", 3)).toBe("2026-06-18")
    expect(shiftDateString("2026-06-15", -3)).toBe("2026-06-12")
    expect(shiftDateString("2026-06-15", 0)).toBe("2026-06-15")
  })

  it("rolls back across a month boundary", () => {
    // The reminder-window case: the 1st looking back 11 days lands on the prior 21st.
    expect(shiftDateString("2026-07-01", -11)).toBe("2026-06-20")
    expect(shiftDateString("2026-08-01", -11)).toBe("2026-07-21")
  })

  it("rolls across a year boundary in both directions", () => {
    expect(shiftDateString("2027-01-05", -10)).toBe("2026-12-26")
    expect(shiftDateString("2026-12-28", 10)).toBe("2027-01-07")
  })

  it("handles short and leap Februaries", () => {
    expect(shiftDateString("2026-03-01", -1)).toBe("2026-02-28")
    expect(shiftDateString("2028-03-01", -1)).toBe("2028-02-29")
  })

  it("zero-pads single-digit months and days", () => {
    expect(shiftDateString("2026-01-10", -1)).toBe("2026-01-09")
    expect(shiftDateString("2026-09-30", 1)).toBe("2026-10-01")
  })

  it("does not drift when applied repeatedly across a DST-changing tz", () => {
    // WIB has no DST, but the helper must not depend on the host's zone either.
    let d = "2026-03-01"
    for (let i = 0; i < 400; i++) d = shiftDateString(d, 1)
    expect(d).toBe(shiftDateString("2026-03-01", 400))
    expect(d).toBe("2027-04-05")
  })
})
