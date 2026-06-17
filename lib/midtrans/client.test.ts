import { describe, it, expect } from "vitest"
import { createHash } from "crypto"
import { verifyMidtransSignature } from "@/lib/midtrans/client"

// Midtrans signs settlement webhooks as sha512(order_id + status_code +
// gross_amount + server_key). verifyMidtransSignature is the only gate between a
// forged HTTP POST and an invoice marked PAID, so these cases pin both the
// happy path and every fail-closed branch.
const ORDER_ID = "INV-123"
const STATUS_CODE = "200"
const GROSS_AMOUNT = "960000.00"
const SERVER_KEY = "test-server-key"

function sign(
  orderId = ORDER_ID,
  statusCode = STATUS_CODE,
  grossAmount = GROSS_AMOUNT,
  serverKey = SERVER_KEY
): string {
  return createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest("hex")
}

describe("verifyMidtransSignature", () => {
  it("accepts a correctly computed signature", () => {
    const sig = sign()
    expect(verifyMidtransSignature(ORDER_ID, STATUS_CODE, GROSS_AMOUNT, SERVER_KEY, sig)).toBe(true)
  })

  it("rejects a tampered gross_amount", () => {
    const sig = sign() // signed over the real amount
    expect(verifyMidtransSignature(ORDER_ID, STATUS_CODE, "1.00", SERVER_KEY, sig)).toBe(false)
  })

  it("rejects a tampered order_id", () => {
    const sig = sign()
    expect(verifyMidtransSignature("INV-999", STATUS_CODE, GROSS_AMOUNT, SERVER_KEY, sig)).toBe(false)
  })

  it("rejects a tampered status_code", () => {
    const sig = sign()
    expect(verifyMidtransSignature(ORDER_ID, "201", GROSS_AMOUNT, SERVER_KEY, sig)).toBe(false)
  })

  it("rejects a signature made with a different server key", () => {
    const sig = sign(ORDER_ID, STATUS_CODE, GROSS_AMOUNT, "attacker-key")
    expect(verifyMidtransSignature(ORDER_ID, STATUS_CODE, GROSS_AMOUNT, SERVER_KEY, sig)).toBe(false)
  })

  it("fails closed when the server key is empty", () => {
    // An unset MIDTRANS_SERVER_KEY (route falls back to "") must never validate.
    const sig = sign(ORDER_ID, STATUS_CODE, GROSS_AMOUNT, "")
    expect(verifyMidtransSignature(ORDER_ID, STATUS_CODE, GROSS_AMOUNT, "", sig)).toBe(false)
  })

  it("fails closed when the incoming signature is empty", () => {
    expect(verifyMidtransSignature(ORDER_ID, STATUS_CODE, GROSS_AMOUNT, SERVER_KEY, "")).toBe(false)
  })

  it("returns false (does not throw) for a length-mismatched signature", () => {
    // Guards the timingSafeEqual byte-length trap called out in the source.
    expect(() =>
      verifyMidtransSignature(ORDER_ID, STATUS_CODE, GROSS_AMOUNT, SERVER_KEY, "deadbeef")
    ).not.toThrow()
    expect(verifyMidtransSignature(ORDER_ID, STATUS_CODE, GROSS_AMOUNT, SERVER_KEY, "deadbeef")).toBe(
      false
    )
  })
})
