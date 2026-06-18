import { describe, it, expect } from "vitest"
import {
  formatLeaveStreakPeriod,
  leaveReviewSummary,
} from "@/lib/billing/leave-review-label"

describe("formatLeaveStreakPeriod", () => {
  it("renders a single label when start and end are the same month", () => {
    expect(formatLeaveStreakPeriod(6, 2026, 6, 2026)).toBe("Juni 2026")
  })

  it("renders a range when start and end differ", () => {
    expect(formatLeaveStreakPeriod(4, 2026, 6, 2026)).toBe("April 2026 – Juni 2026")
  })

  it("renders a range spanning a year boundary", () => {
    expect(formatLeaveStreakPeriod(12, 2025, 1, 2026)).toBe("Desember 2025 – Januari 2026")
  })
})

describe("leaveReviewSummary", () => {
  it("combines the streak count with the period", () => {
    const alert = {
      consecutive_months: 3,
      period_start_month: 4,
      period_start_year: 2026,
      period_end_month: 6,
      period_end_year: 2026,
    }
    expect(leaveReviewSummary(alert as Parameters<typeof leaveReviewSummary>[0])).toBe(
      "3 bulan cuti berturut-turut (April 2026 – Juni 2026)"
    )
  })
})
