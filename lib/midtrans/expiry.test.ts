import { describe, it, expect } from "vitest"
import {
  parseMidtransExpiryTime,
  isExpiryTimeInFuture,
  isWithinSnapPageWindow,
} from "@/lib/midtrans/expiry"

describe("parseMidtransExpiryTime", () => {
  it("parses the Midtrans WIB format as +07:00", () => {
    expect(parseMidtransExpiryTime("2026-06-18 12:00:00")).toBe(
      new Date("2026-06-18T12:00:00+07:00").getTime()
    )
  })

  it("parses an ISO timestamp directly", () => {
    expect(parseMidtransExpiryTime("2026-06-18T05:00:00Z")).toBe(
      new Date("2026-06-18T05:00:00Z").getTime()
    )
  })
})

describe("isExpiryTimeInFuture", () => {
  const now = new Date("2026-06-18T05:00:00Z").getTime()

  it("is true for a future expiry and false for a past one", () => {
    expect(isExpiryTimeInFuture("2026-06-18T06:00:00Z", now)).toBe(true)
    expect(isExpiryTimeInFuture("2026-06-18T04:00:00Z", now)).toBe(false)
  })

  it("is false for an undefined expiry", () => {
    expect(isExpiryTimeInFuture(undefined, now)).toBe(false)
  })
})

describe("isWithinSnapPageWindow", () => {
  const now = new Date("2026-06-18T12:00:00Z").getTime()

  it("is true within the expiry window and false past it", () => {
    // created 1h ago, 24h window → within
    expect(isWithinSnapPageWindow("2026-06-18T11:00:00Z", 24, now)).toBe(true)
    // created 25h ago, 24h window → expired
    expect(isWithinSnapPageWindow("2026-06-17T11:00:00Z", 24, now)).toBe(false)
  })

  it("is false when there is no snap timestamp", () => {
    expect(isWithinSnapPageWindow(null, 24, now)).toBe(false)
  })
})
