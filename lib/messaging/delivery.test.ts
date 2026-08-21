import { describe, it, expect } from "vitest"
import { createHmac } from "crypto"
import {
  verifyMetaSignature,
  parseMetaStatusEvents,
  DELIVERY_STATUS_RANK,
  dedupeStatusEvents,
  planDeliveryUpdates,
  statusesBelow,
  chunk,
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

const ev = (
  wamid: string,
  status: "SENT" | "DELIVERED" | "READ" | "FAILED",
  timestamp: number | null = 1787000000
) => ({ wamid, status, timestamp, errorCode: null, errorTitle: null })

describe("chunk", () => {
  it("splits into runs of at most `size` and keeps every item once", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([1, 2], 5)).toEqual([[1, 2]])
    expect(chunk([], 3)).toEqual([])
  })
})

describe("statusesBelow", () => {
  it("lists only strictly lower-ranked statuses", () => {
    expect(statusesBelow("READ").sort()).toEqual(["DELIVERED", "FAILED", "SENT"])
    expect(statusesBelow("DELIVERED").sort()).toEqual(["FAILED", "SENT"])
    expect(statusesBelow("SENT")).toEqual([])
  })
})

describe("dedupeStatusEvents", () => {
  it("keeps the highest-ranked status per wamid", () => {
    const out = dedupeStatusEvents([ev("a", "DELIVERED"), ev("a", "READ"), ev("b", "SENT")])
    expect(out).toHaveLength(2)
    expect(out.find((e) => e.wamid === "a")!.status).toBe("READ")
  })

  it("is order-independent — a late-arriving lower status never wins", () => {
    const out = dedupeStatusEvents([ev("a", "READ"), ev("a", "DELIVERED")])
    expect(out[0].status).toBe("READ")
  })

  it("passes distinct wamids through untouched", () => {
    expect(dedupeStatusEvents([ev("a", "READ"), ev("b", "READ")])).toHaveLength(2)
    expect(dedupeStatusEvents([])).toEqual([])
  })
})

describe("planDeliveryUpdates", () => {
  const NOW = "2026-08-21T12:00:00.000Z"

  it("groups rows sharing an identical patch into one update", () => {
    const rows = ["r1", "r2", "r3"].map((id) => ({ id, wamid: `w${id}`, status: "DELIVERED" as const }))
    const plans = planDeliveryUpdates(
      rows.map((r) => ev(r.wamid, "READ")),
      rows,
      NOW
    )
    expect(plans).toHaveLength(1)
    expect(plans[0].ids.sort()).toEqual(["r1", "r2", "r3"])
    expect(plans[0].status).toBe("READ")
  })

  it("separates groups when timestamps differ", () => {
    const rows = [
      { id: "r1", wamid: "w1", status: "DELIVERED" as const },
      { id: "r2", wamid: "w2", status: "DELIVERED" as const },
    ]
    const plans = planDeliveryUpdates(
      [ev("w1", "READ", 1787000000), ev("w2", "READ", 1787000999)],
      rows,
      NOW
    )
    expect(plans).toHaveLength(2)
  })

  it("skips unknown wamids", () => {
    expect(planDeliveryUpdates([ev("ghost", "READ")], [], NOW)).toEqual([])
  })

  it("never downgrades — equal or lower rank is dropped", () => {
    const rows = [{ id: "r1", wamid: "w1", status: "READ" as const }]
    expect(planDeliveryUpdates([ev("w1", "DELIVERED")], rows, NOW)).toEqual([])
    expect(planDeliveryUpdates([ev("w1", "READ")], rows, NOW)).toEqual([])
    expect(planDeliveryUpdates([ev("w1", "FAILED")], rows, NOW)).toEqual([])
  })

  it("falls back to nowIso when Meta omits a timestamp", () => {
    const rows = [{ id: "r1", wamid: "w1", status: "SENT" as const }]
    const plans = planDeliveryUpdates([ev("w1", "DELIVERED", null)], rows, NOW)
    expect(plans[0].timestampIso).toBe(NOW)
  })

  it("carries error details only for FAILED", () => {
    const rows = [
      { id: "r1", wamid: "w1", status: "SENT" as const },
      { id: "r2", wamid: "w2", status: "SENT" as const },
    ]
    const plans = planDeliveryUpdates(
      [
        { ...ev("w1", "FAILED"), errorCode: "131049", errorTitle: "Undeliverable" },
        { ...ev("w2", "DELIVERED"), errorCode: "999", errorTitle: "ignored" },
      ],
      rows,
      NOW
    )
    const failed = plans.find((p) => p.status === "FAILED")!
    const delivered = plans.find((p) => p.status === "DELIVERED")!
    expect(failed.errorCode).toBe("131049")
    expect(delivered.errorCode).toBeNull()
    expect(delivered.errorTitle).toBeNull()
  })

  it("collapses a bulk read of many messages into a handful of updates", () => {
    // The real failure mode: one chat opened, hundreds marked read at the same instant.
    const rows = Array.from({ length: 500 }, (_, i) => ({
      id: `r${i}`,
      wamid: `w${i}`,
      status: "DELIVERED" as const,
    }))
    const plans = planDeliveryUpdates(rows.map((r) => ev(r.wamid, "READ")), rows, NOW)
    expect(plans).toHaveLength(1)
    expect(plans[0].ids).toHaveLength(500)
  })
})
