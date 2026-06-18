import { describe, it, expect } from "vitest"
import {
  dedupeLeaveMonths,
  longestConsecutiveLeaveStreak,
  currentConsecutiveLeaveStreak,
  getCurrentLeaveStreakPeriod,
  needsLeaveReview,
  parseMaxLeaveMonthsConfig,
  DEFAULT_MAX_CONSECUTIVE_LEAVE_MONTHS,
  type LeaveMonth,
} from "@/lib/billing/leaves"

describe("dedupeLeaveMonths", () => {
  it("removes duplicates and sorts chronologically", () => {
    const input: LeaveMonth[] = [
      { month: 3, year: 2026 },
      { month: 1, year: 2026 },
      { month: 3, year: 2026 },
    ]
    expect(dedupeLeaveMonths(input)).toEqual([
      { month: 1, year: 2026 },
      { month: 3, year: 2026 },
    ])
  })
})

describe("longestConsecutiveLeaveStreak", () => {
  it("returns 0 for no leaves and 1 for a lone month", () => {
    expect(longestConsecutiveLeaveStreak([])).toBe(0)
    expect(longestConsecutiveLeaveStreak([{ month: 5, year: 2026 }])).toBe(1)
  })

  it("counts the longest adjacent run, ignoring gaps", () => {
    const leaves: LeaveMonth[] = [
      { month: 1, year: 2026 },
      { month: 2, year: 2026 },
      { month: 3, year: 2026 },
      // gap
      { month: 6, year: 2026 },
    ]
    expect(longestConsecutiveLeaveStreak(leaves)).toBe(3)
  })

  it("counts adjacency across a year boundary (Dec → Jan)", () => {
    expect(
      longestConsecutiveLeaveStreak([
        { month: 12, year: 2025 },
        { month: 1, year: 2026 },
      ])
    ).toBe(2)
  })
})

describe("currentConsecutiveLeaveStreak", () => {
  it("measures the run ending at the latest month", () => {
    const leaves: LeaveMonth[] = [
      { month: 1, year: 2026 }, // isolated
      { month: 4, year: 2026 },
      { month: 5, year: 2026 },
      { month: 6, year: 2026 },
    ]
    expect(currentConsecutiveLeaveStreak(leaves)).toBe(3)
  })

  it("is 1 when the latest month is isolated", () => {
    expect(
      currentConsecutiveLeaveStreak([
        { month: 1, year: 2026 },
        { month: 2, year: 2026 },
        { month: 9, year: 2026 },
      ])
    ).toBe(1)
  })
})

describe("getCurrentLeaveStreakPeriod", () => {
  it("returns the inclusive start/end of the current streak", () => {
    const leaves: LeaveMonth[] = [
      { month: 4, year: 2026 },
      { month: 5, year: 2026 },
      { month: 6, year: 2026 },
    ]
    expect(getCurrentLeaveStreakPeriod(leaves)).toEqual({
      start: { month: 4, year: 2026 },
      end: { month: 6, year: 2026 },
    })
  })

  it("returns null for no leaves", () => {
    expect(getCurrentLeaveStreakPeriod([])).toBeNull()
  })
})

describe("needsLeaveReview", () => {
  const leaves: LeaveMonth[] = [
    { month: 4, year: 2026 },
    { month: 5, year: 2026 },
    { month: 6, year: 2026 },
  ]

  it("is true when the current streak reaches the limit", () => {
    expect(needsLeaveReview(leaves, 3)).toBe(true)
  })

  it("is false when the current streak is below the limit", () => {
    expect(needsLeaveReview(leaves, 4)).toBe(false)
  })

  it("is false when the limit is non-positive", () => {
    expect(needsLeaveReview(leaves, 0)).toBe(false)
  })
})

describe("parseMaxLeaveMonthsConfig", () => {
  it("returns a valid positive months value", () => {
    expect(parseMaxLeaveMonthsConfig({ months: 5 })).toBe(5)
  })

  it("falls back to the default for missing/invalid values", () => {
    expect(parseMaxLeaveMonthsConfig(null)).toBe(DEFAULT_MAX_CONSECUTIVE_LEAVE_MONTHS)
    expect(parseMaxLeaveMonthsConfig({})).toBe(DEFAULT_MAX_CONSECUTIVE_LEAVE_MONTHS)
    expect(parseMaxLeaveMonthsConfig({ months: 0 })).toBe(DEFAULT_MAX_CONSECUTIVE_LEAVE_MONTHS)
    expect(parseMaxLeaveMonthsConfig({ months: "x" })).toBe(DEFAULT_MAX_CONSECUTIVE_LEAVE_MONTHS)
  })
})
