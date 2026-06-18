import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  getAppOrigin,
  buildPaymentLink,
  buildPaymentLinkFromEnv,
  generatePaymentAccessToken,
} from "@/lib/payments/pay-link"

describe("pay-link helpers", () => {
  const original = process.env.NEXT_PUBLIC_APP_URL

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://center.example.com"
  })

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = original
  })

  describe("getAppOrigin", () => {
    it("returns the configured origin", () => {
      expect(getAppOrigin()).toBe("https://center.example.com")
    })

    it("strips a trailing slash", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://center.example.com/"
      expect(getAppOrigin()).toBe("https://center.example.com")
    })

    it("throws when the origin is not configured", () => {
      delete process.env.NEXT_PUBLIC_APP_URL
      expect(() => getAppOrigin()).toThrow(/NEXT_PUBLIC_APP_URL/)
    })
  })

  describe("buildPaymentLink", () => {
    it("builds the /pay/{token} URL", () => {
      expect(buildPaymentLink("abc123")).toBe("https://center.example.com/pay/abc123")
    })
  })

  describe("buildPaymentLinkFromEnv", () => {
    it("returns the URL when env and token are present", () => {
      expect(buildPaymentLinkFromEnv("abc123")).toBe("https://center.example.com/pay/abc123")
    })

    it("returns null when the env is unset", () => {
      delete process.env.NEXT_PUBLIC_APP_URL
      expect(buildPaymentLinkFromEnv("abc123")).toBeNull()
    })

    it("returns null for an empty token", () => {
      expect(buildPaymentLinkFromEnv("")).toBeNull()
    })
  })

  describe("generatePaymentAccessToken", () => {
    it("produces a 32-char hex token", () => {
      expect(generatePaymentAccessToken()).toMatch(/^[0-9a-f]{32}$/)
    })

    it("produces unique tokens", () => {
      expect(generatePaymentAccessToken()).not.toBe(generatePaymentAccessToken())
    })
  })
})
