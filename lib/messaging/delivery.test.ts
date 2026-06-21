import { describe, it, expect } from "vitest"
import { createHmac } from "crypto"
import {
  verifyMetaSignature,
  parseMetaStatusEvents,
  DELIVERY_STATUS_RANK,
} from "@/lib/messaging/delivery"

const SECRET = "test-app-secret"

function sign(body: string, secret = SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex")
}

describe("verifyMetaSignature", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account" })

  it("accepts a correct signature", () => {
    expect(verifyMetaSignature(body, sign(body), SECRET)).toBe(true)
  })

  it("rejects a wrong signature", () => {
    expect(verifyMetaSignature(body, sign("other body"), SECRET)).toBe(false)
  })

  it("rejects a signature signed with a different secret", () => {
    expect(verifyMetaSignature(body, sign(body, "wrong-secret"), SECRET)).toBe(false)
  })

  it("fails closed when the app secret is missing", () => {
    expect(verifyMetaSignature(body, sign(body), "")).toBe(false)
  })

  it("fails closed when the signature header is missing", () => {
    expect(verifyMetaSignature(body, null, SECRET)).toBe(false)
    expect(verifyMetaSignature(body, undefined, SECRET)).toBe(false)
  })

  it("rejects a header without the sha256= prefix", () => {
    const raw = createHmac("sha256", SECRET).update(body, "utf8").digest("hex")
    expect(verifyMetaSignature(body, raw, SECRET)).toBe(false)
  })

  it("rejects a length-mismatched signature without throwing", () => {
    expect(verifyMetaSignature(body, "sha256=abc", SECRET)).toBe(false)
  })
})

describe("parseMetaStatusEvents", () => {
  function payload(statuses: unknown[]) {
    return {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { statuses } }] }],
    }
  }

  it("returns [] for non-status payloads", () => {
    expect(parseMetaStatusEvents(null)).toEqual([])
    expect(parseMetaStatusEvents({})).toEqual([])
    expect(parseMetaStatusEvents({ entry: [{ changes: [{ value: { messages: [] } }] }] })).toEqual([])
  })

  it("normalizes a delivered status", () => {
    const events = parseMetaStatusEvents(
      payload([{ id: "wamid.A", status: "delivered", timestamp: "1700000000" }])
    )
    expect(events).toEqual([
      { wamid: "wamid.A", status: "DELIVERED", timestamp: 1700000000, errorCode: null, errorTitle: null },
    ])
  })

  it("maps all known statuses and drops unknown ones", () => {
    const events = parseMetaStatusEvents(
      payload([
        { id: "a", status: "sent" },
        { id: "b", status: "read" },
        { id: "c", status: "bogus" },
        { id: "d", status: "failed" },
      ])
    )
    expect(events.map((e) => [e.wamid, e.status])).toEqual([
      ["a", "SENT"],
      ["b", "READ"],
      ["d", "FAILED"],
    ])
  })

  it("extracts error code/title on failure", () => {
    const events = parseMetaStatusEvents(
      payload([
        {
          id: "x",
          status: "failed",
          timestamp: "1700000001",
          errors: [{ code: 131026, title: "Message undeliverable" }],
        },
      ])
    )
    expect(events[0]).toMatchObject({
      wamid: "x",
      status: "FAILED",
      errorCode: "131026",
      errorTitle: "Message undeliverable",
    })
  })

  it("skips entries missing an id", () => {
    expect(parseMetaStatusEvents(payload([{ status: "delivered" }]))).toEqual([])
  })
})

describe("DELIVERY_STATUS_RANK", () => {
  it("ranks SENT < FAILED < DELIVERED < READ so a late failure can't overwrite delivered/read", () => {
    expect(DELIVERY_STATUS_RANK.SENT).toBeLessThan(DELIVERY_STATUS_RANK.FAILED)
    expect(DELIVERY_STATUS_RANK.FAILED).toBeLessThan(DELIVERY_STATUS_RANK.DELIVERED)
    expect(DELIVERY_STATUS_RANK.DELIVERED).toBeLessThan(DELIVERY_STATUS_RANK.READ)
  })
})
