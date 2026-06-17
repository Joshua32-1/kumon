import { describe, it, expect } from "vitest"
import {
  parseFeeSchedule,
  feesEqual,
  resolveFeesForPeriod,
  appendFeeScheduleEntry,
  type FeeScheduleEntry,
} from "@/lib/billing/fee-schedule"
import { DEFAULT_SUBJECT_FEES, type SubjectFeeConfig } from "@/lib/billing/fees"

function feeConfig(elementaryEnglish: number): SubjectFeeConfig {
  return parseFeesHelper(elementaryEnglish)
}

// Build a distinct-but-valid config by overriding one number, so entries are
// easy to tell apart in assertions.
function parseFeesHelper(elementaryEnglish: number): SubjectFeeConfig {
  return {
    elementary: { ...DEFAULT_SUBJECT_FEES.elementary, english: elementaryEnglish },
    secondary: { ...DEFAULT_SUBJECT_FEES.secondary },
  }
}

describe("parseFeeSchedule", () => {
  it("returns [] for non-array input", () => {
    expect(parseFeeSchedule(null)).toEqual([])
    expect(parseFeeSchedule({})).toEqual([])
  })

  it("drops malformed rows and sorts the rest oldest-first", () => {
    const parsed = parseFeeSchedule([
      { year: 2026, month: 6, fees: {} },
      { year: 2025, month: 1, fees: {} },
      { year: 2026, month: 13, fees: {} }, // invalid month → dropped
      { nonsense: true }, // not an entry → dropped
    ])
    expect(parsed.map((e) => `${e.year}-${e.month}`)).toEqual(["2025-1", "2026-6"])
  })
})

describe("feesEqual", () => {
  it("is true for identical configs and false when any cell differs", () => {
    expect(feesEqual(DEFAULT_SUBJECT_FEES, DEFAULT_SUBJECT_FEES)).toBe(true)
    expect(feesEqual(DEFAULT_SUBJECT_FEES, feeConfig(999_999))).toBe(false)
  })
})

describe("resolveFeesForPeriod", () => {
  const schedule: FeeScheduleEntry[] = [
    { year: 2025, month: 1, fees: feeConfig(400_000) },
    { year: 2026, month: 1, fees: feeConfig(500_000) },
    { year: 2026, month: 6, fees: feeConfig(600_000) },
  ]

  it("picks the latest entry effective on or before the period", () => {
    expect(resolveFeesForPeriod(schedule, 3, 2026).elementary.english).toBe(500_000)
  })

  it("matches an entry exactly on its effective period", () => {
    expect(resolveFeesForPeriod(schedule, 6, 2026).elementary.english).toBe(600_000)
  })

  it("falls back when the period precedes every entry", () => {
    expect(resolveFeesForPeriod(schedule, 12, 2024)).toBe(DEFAULT_SUBJECT_FEES)
  })
})

describe("appendFeeScheduleEntry", () => {
  it("replaces an existing entry for the same period", () => {
    const start: FeeScheduleEntry[] = [{ year: 2026, month: 6, fees: feeConfig(500_000) }]
    const next = appendFeeScheduleEntry(start, 6, 2026, feeConfig(700_000))
    expect(next).toHaveLength(1)
    expect(next[0].fees.elementary.english).toBe(700_000)
  })

  it("is a no-op when the new fees equal the latest entry", () => {
    const start: FeeScheduleEntry[] = [{ year: 2026, month: 1, fees: feeConfig(500_000) }]
    const next = appendFeeScheduleEntry(start, 6, 2026, feeConfig(500_000))
    expect(next).toBe(start) // same reference — nothing changed
  })

  it("appends a genuinely new fee change in sorted order", () => {
    const start: FeeScheduleEntry[] = [{ year: 2025, month: 1, fees: feeConfig(400_000) }]
    const next = appendFeeScheduleEntry(start, 6, 2026, feeConfig(600_000))
    expect(next.map((e) => `${e.year}-${e.month}`)).toEqual(["2025-1", "2026-6"])
  })
})
