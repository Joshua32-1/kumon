import { describe, it, expect, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { verifyCronAuth } from "@/lib/auth/cron"

// verifyCronAuth reads CRON_SECRET / WEBHOOK_SECRET at call time, so each test
// sets exactly the env it needs and restores afterward.
function fakeRequest(headers: Record<string, string>): NextRequest {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  )
  return {
    headers: { get: (key: string) => lower[key.toLowerCase()] ?? null },
  } as unknown as NextRequest
}

describe("verifyCronAuth", () => {
  const originalCron = process.env.CRON_SECRET
  const originalWebhook = process.env.WEBHOOK_SECRET

  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret"
    process.env.WEBHOOK_SECRET = "webhook-secret"
  })

  afterEach(() => {
    process.env.CRON_SECRET = originalCron
    process.env.WEBHOOK_SECRET = originalWebhook
  })

  it("accepts a matching x-api-key", () => {
    expect(verifyCronAuth(fakeRequest({ "x-api-key": "webhook-secret" }))).toBe(true)
  })

  it("accepts a matching Bearer token", () => {
    expect(verifyCronAuth(fakeRequest({ authorization: "Bearer cron-secret" }))).toBe(true)
  })

  it("rejects a wrong x-api-key", () => {
    expect(verifyCronAuth(fakeRequest({ "x-api-key": "nope" }))).toBe(false)
  })

  it("rejects a wrong Bearer token", () => {
    expect(verifyCronAuth(fakeRequest({ authorization: "Bearer wrong" }))).toBe(false)
  })

  it("rejects bearer auth when CRON_SECRET is unset", () => {
    delete process.env.CRON_SECRET
    expect(verifyCronAuth(fakeRequest({ authorization: "Bearer cron-secret" }))).toBe(false)
  })

  it("rejects any x-api-key when WEBHOOK_SECRET is unset", () => {
    // Symmetric to the bearer case: a missing secret must never validate, even
    // if a client happens to send a key.
    delete process.env.WEBHOOK_SECRET
    expect(verifyCronAuth(fakeRequest({ "x-api-key": "anything" }))).toBe(false)
  })

  it("rejects a request with no auth headers", () => {
    expect(verifyCronAuth(fakeRequest({}))).toBe(false)
  })

  it("does not accept an empty x-api-key even if WEBHOOK_SECRET is empty", () => {
    process.env.WEBHOOK_SECRET = ""
    expect(verifyCronAuth(fakeRequest({ "x-api-key": "" }))).toBe(false)
  })
})
