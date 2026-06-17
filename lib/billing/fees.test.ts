import { describe, it, expect } from "vitest"
import {
  computeInvoiceLineItems,
  parseSubjectFees,
  formatLineItemsForMessage,
  DEFAULT_SUBJECT_FEES,
} from "@/lib/billing/fees"

describe("computeInvoiceLineItems", () => {
  it("prices elementary students at the elementary tier", () => {
    const result = computeInvoiceLineItems(
      "ELEMENTARY",
      ["ENGLISH", "MATHEMATICS"],
      DEFAULT_SUBJECT_FEES
    )
    expect(result.lines).toEqual([
      { subject: "ENGLISH", label: "English", unit_amount: 480_000 },
      { subject: "MATHEMATICS", label: "Matematika", unit_amount: 480_000 },
    ])
    expect(result.total).toBe(960_000)
  })

  it("prices secondary students at the secondary tier", () => {
    const result = computeInvoiceLineItems("SECONDARY", ["ENGLISH"], DEFAULT_SUBJECT_FEES)
    expect(result.lines[0].unit_amount).toBe(530_000)
    expect(result.total).toBe(530_000)
  })

  it("returns an empty line set and zero total for no subjects", () => {
    const result = computeInvoiceLineItems("ELEMENTARY", [], DEFAULT_SUBJECT_FEES)
    expect(result.lines).toEqual([])
    expect(result.total).toBe(0)
  })

  it("uses the supplied custom fee config", () => {
    const custom = {
      elementary: { english: 100_000, indonesian: 100_000, mathematics: 100_000 },
      secondary: { english: 200_000, indonesian: 200_000, mathematics: 200_000 },
    }
    const result = computeInvoiceLineItems("ELEMENTARY", ["INDONESIAN"], custom)
    expect(result.total).toBe(100_000)
  })
})

describe("parseSubjectFees", () => {
  it("falls back to defaults for null/undefined/empty input", () => {
    expect(parseSubjectFees(null)).toEqual(DEFAULT_SUBJECT_FEES)
    expect(parseSubjectFees(undefined)).toEqual(DEFAULT_SUBJECT_FEES)
    expect(parseSubjectFees({})).toEqual(DEFAULT_SUBJECT_FEES)
  })

  it("merges a partial override over defaults per tier", () => {
    const parsed = parseSubjectFees({ elementary: { english: 500_000 } })
    expect(parsed.elementary.english).toBe(500_000)
    // Untouched subjects keep their defaults.
    expect(parsed.elementary.mathematics).toBe(DEFAULT_SUBJECT_FEES.elementary.mathematics)
    expect(parsed.secondary).toEqual(DEFAULT_SUBJECT_FEES.secondary)
  })
})

describe("formatLineItemsForMessage", () => {
  it("renders one bulleted Rupiah line per item", () => {
    const text = formatLineItemsForMessage([
      { label: "English", unit_amount: 480_000 },
      { label: "Matematika", unit_amount: 480_000 },
    ])
    const lines = text.split("\n")
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain("English")
    expect(lines[0]).toContain("480")
    expect(lines[0].startsWith("•")).toBe(true)
  })
})
