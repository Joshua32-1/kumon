import { describe, it, expect } from "vitest"
import {
  getWhatsAppDeliveryStatus,
  getBillingAttentionWithReason,
  getBillingAttention,
  getBillingSummary,
} from "@/features/payments/billing-summary"
import { makeInvoice, makeReminder } from "@/lib/test/factories"

const TODAY = "2026-06-18"

describe("getWhatsAppDeliveryStatus", () => {
  it("is not_applicable when there is no invoice", () => {
    expect(getWhatsAppDeliveryStatus(null, [])).toBe("not_applicable")
  })

  it("is no_link when the invoice has no pay-link token", () => {
    expect(getWhatsAppDeliveryStatus(makeInvoice({ payment_access_token: "" }), [])).toBe("no_link")
  })

  it("is link_not_sent when a link exists but no reminders were sent", () => {
    expect(getWhatsAppDeliveryStatus(makeInvoice(), [])).toBe("link_not_sent")
  })

  it("is sent when at least one reminder succeeded", () => {
    expect(getWhatsAppDeliveryStatus(makeInvoice(), [makeReminder({ status: "SENT" })])).toBe("sent")
  })

  it("is send_failed when reminders only failed", () => {
    expect(getWhatsAppDeliveryStatus(makeInvoice(), [makeReminder({ status: "FAILED" })])).toBe("send_failed")
  })

  it("is partial_failed on a mix of SENT and FAILED", () => {
    const status = getWhatsAppDeliveryStatus(makeInvoice(), [
      makeReminder({ id: "r1", status: "SENT" }),
      makeReminder({ id: "r2", status: "FAILED" }),
    ])
    expect(status).toBe("partial_failed")
  })
})

describe("getBillingAttentionWithReason", () => {
  it("returns none for terminal statuses", () => {
    for (const status of ["PAID", "PAID_OLD_LINK", "CANCELLED", "WAIVED"] as const) {
      expect(getBillingAttentionWithReason(makeInvoice({ status }), [], TODAY)).toEqual({
        attention: "none",
        attentionReason: null,
      })
    }
  })

  it("flags a delivery problem when the link was never sent", () => {
    const result = getBillingAttentionWithReason(makeInvoice({ status: "OVERDUE" }), [], TODAY)
    expect(result).toEqual({ attention: "needs_action", attentionReason: "delivery" })
  })

  it("prioritises delivery over collection when both apply", () => {
    // OVERDUE (collection) AND a failed send (delivery) → delivery wins.
    const result = getBillingAttentionWithReason(
      makeInvoice({ status: "OVERDUE" }),
      [makeReminder({ status: "FAILED" })],
      TODAY
    )
    expect(result.attentionReason).toBe("delivery")
  })

  it("flags collection when WA was sent but the invoice is OVERDUE", () => {
    const result = getBillingAttentionWithReason(
      makeInvoice({ status: "OVERDUE" }),
      [makeReminder({ status: "SENT" })],
      TODAY
    )
    expect(result).toEqual({ attention: "needs_action", attentionReason: "collection" })
  })

  it("flags collection when a sent PENDING invoice is past its due_date", () => {
    const result = getBillingAttentionWithReason(
      makeInvoice({ status: "PENDING", due_date: "2026-05-31" }),
      [makeReminder({ status: "SENT" })],
      TODAY
    )
    expect(result.attentionReason).toBe("collection")
  })

  it("treats a stranded past-due PENDING reminder as a delivery problem", () => {
    // Sent reminder keeps WA status healthy, but a PENDING reminder scheduled in
    // the past means a send window was missed.
    const result = getBillingAttentionWithReason(
      makeInvoice({ status: "PENDING", due_date: "2026-06-30" }),
      [
        makeReminder({ id: "r1", status: "SENT" }),
        makeReminder({ id: "r2", status: "PENDING", scheduled_date: "2026-06-10" }),
      ],
      TODAY
    )
    expect(result).toEqual({ attention: "needs_action", attentionReason: "delivery" })
  })

  it("returns none for a healthy, sent, not-yet-due PENDING invoice", () => {
    const result = getBillingAttentionWithReason(
      makeInvoice({ status: "PENDING", due_date: "2026-06-30" }),
      [makeReminder({ status: "SENT" })],
      TODAY
    )
    expect(result).toEqual({ attention: "none", attentionReason: null })
  })
})

describe("getBillingAttention", () => {
  it("returns only the attention flag", () => {
    expect(getBillingAttention(makeInvoice({ status: "OVERDUE" }), [])).toBe("needs_action")
    expect(getBillingAttention(makeInvoice({ status: "PAID" }), [])).toBe("none")
  })
})

describe("getBillingSummary", () => {
  it("reports firstSentAt from the first SENT reminder", () => {
    const summary = getBillingSummary(
      makeInvoice({ status: "OVERDUE" }),
      [
        makeReminder({ id: "r1", status: "FAILED" }),
        makeReminder({ id: "r2", status: "SENT", sent_at: "2026-06-02T03:00:00Z" }),
      ],
      TODAY
    )
    expect(summary.whatsappStatus).toBe("partial_failed")
    expect(summary.firstSentAt).toBe("2026-06-02T03:00:00Z")
  })

  it("leaves firstSentAt null when nothing was sent", () => {
    const summary = getBillingSummary(makeInvoice(), [], TODAY)
    expect(summary.firstSentAt).toBeNull()
  })
})
