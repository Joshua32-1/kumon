import { describe, it, expect } from "vitest"
import { isPaymentStatus, parseLedgerParams } from "@/lib/reports/ledger-query"

const NOW = new Date("2026-06-17T05:00:00Z") // 2026 WIB

function parse(qs: string) {
  return parseLedgerParams(new URLSearchParams(qs), NOW)
}

describe("isPaymentStatus", () => {
  it("accepts valid statuses and rejects junk", () => {
    expect(isPaymentStatus("PAID")).toBe(true)
    expect(isPaymentStatus("PAID_OLD_LINK")).toBe(true)
    expect(isPaymentStatus("nope")).toBe(false)
  })
})

describe("parseLedgerParams", () => {
  it("defaults the year to the current WIB year", () => {
    const r = parse("")
    expect(r).toEqual({ ok: true, params: { year: 2026, status: undefined } })
  })

  it("parses an explicit year and status", () => {
    const r = parse("year=2025&status=PAID")
    expect(r).toEqual({ ok: true, params: { year: 2025, status: "PAID" } })
  })

  it("rejects an out-of-range year", () => {
    expect(parse("year=1999").ok).toBe(false)
    expect(parse("year=abc").ok).toBe(false)
  })

  it("rejects an invalid status", () => {
    const r = parse("status=BOGUS")
    expect(r.ok).toBe(false)
  })
})
