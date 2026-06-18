import { describe, it, expect } from "vitest"
import { getErrorStatusCode, isRetryableMidtransError } from "@/lib/midtrans/errors"

describe("getErrorStatusCode", () => {
  it("extracts a numeric statusCode from an error-like object", () => {
    expect(getErrorStatusCode({ statusCode: 503 })).toBe(503)
  })

  it("returns undefined when absent", () => {
    expect(getErrorStatusCode(new Error("boom"))).toBeUndefined()
    expect(getErrorStatusCode(null)).toBeUndefined()
    expect(getErrorStatusCode("x")).toBeUndefined()
  })
})

describe("isRetryableMidtransError", () => {
  it("retries on throttling/server status codes", () => {
    for (const statusCode of [429, 502, 503, 504]) {
      expect(isRetryableMidtransError({ statusCode })).toBe(true)
    }
  })

  it("retries on transient message patterns", () => {
    expect(isRetryableMidtransError(new Error("Rate limit exceeded"))).toBe(true)
    expect(isRetryableMidtransError(new Error("connection ETIMEDOUT"))).toBe(true)
    expect(isRetryableMidtransError(new Error("socket ECONNRESET"))).toBe(true)
    expect(isRetryableMidtransError("Request timeout")).toBe(true)
  })

  it("does not retry on client errors or plain failures", () => {
    expect(isRetryableMidtransError({ statusCode: 400 })).toBe(false)
    expect(isRetryableMidtransError({ statusCode: 404 })).toBe(false)
    expect(isRetryableMidtransError(new Error("invalid signature"))).toBe(false)
  })
})
