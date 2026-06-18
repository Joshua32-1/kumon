import { describe, it, expect } from "vitest"
import {
  isValidMidtransSettlement,
  appendOrderId,
  decideMidtransSettlement,
} from "@/lib/payments/settlement"

describe("isValidMidtransSettlement", () => {
  it("accepts settlement/capture without fraud deny", () => {
    expect(isValidMidtransSettlement("settlement")).toBe(true)
    expect(isValidMidtransSettlement("capture", "accept")).toBe(true)
  })

  it("rejects non-success statuses", () => {
    expect(isValidMidtransSettlement("pending")).toBe(false)
    expect(isValidMidtransSettlement("expire")).toBe(false)
    expect(isValidMidtransSettlement("deny")).toBe(false)
  })

  it("rejects a fraud-denied transaction even if otherwise successful", () => {
    expect(isValidMidtransSettlement("capture", "deny")).toBe(false)
    expect(isValidMidtransSettlement("settlement", "deny")).toBe(false)
  })
})

describe("appendOrderId", () => {
  it("appends a new id", () => {
    expect(appendOrderId(["a"], "b")).toEqual(["a", "b"])
  })

  it("is a no-op for a duplicate id (same reference)", () => {
    const ids = ["a", "b"]
    expect(appendOrderId(ids, "a")).toBe(ids)
  })

  it("handles null/undefined existing", () => {
    expect(appendOrderId(null, "a")).toEqual(["a"])
    expect(appendOrderId(undefined, "a")).toEqual(["a"])
  })
})

describe("decideMidtransSettlement", () => {
  it("is a no-op when already PAID or PAID_OLD_LINK", () => {
    expect(
      decideMidtransSettlement({ currentStatus: "PAID", isCurrentOrder: true, orderInHistory: true })
    ).toEqual({ action: "already_settled", status: "PAID" })
    expect(
      decideMidtransSettlement({ currentStatus: "PAID_OLD_LINK", isCurrentOrder: false, orderInHistory: true })
    ).toEqual({ action: "already_settled", status: "PAID_OLD_LINK" })
  })

  it("is unrelated when the order belongs to neither current nor history", () => {
    expect(
      decideMidtransSettlement({ currentStatus: "PENDING", isCurrentOrder: false, orderInHistory: false })
    ).toEqual({ action: "unrelated" })
  })

  it("marks PAID_OLD_LINK (no confirm, no cancel) for CANCELLED/WAIVED", () => {
    for (const currentStatus of ["CANCELLED", "WAIVED"] as const) {
      expect(
        decideMidtransSettlement({ currentStatus, isCurrentOrder: true, orderInHistory: true })
      ).toEqual({
        action: "settle",
        newStatus: "PAID_OLD_LINK",
        sendConfirmation: false,
        cancelReminders: false,
      })
    }
  })

  it("marks PAID_OLD_LINK (cancel reminders) when an OLD order settles a still-unpaid invoice", () => {
    for (const currentStatus of ["PENDING", "OVERDUE"] as const) {
      expect(
        decideMidtransSettlement({ currentStatus, isCurrentOrder: false, orderInHistory: true })
      ).toEqual({
        action: "settle",
        newStatus: "PAID_OLD_LINK",
        sendConfirmation: false,
        cancelReminders: true,
      })
    }
  })

  it("marks PAID (confirm + cancel) when the CURRENT order settles an unpaid invoice", () => {
    for (const currentStatus of ["PENDING", "OVERDUE"] as const) {
      expect(
        decideMidtransSettlement({ currentStatus, isCurrentOrder: true, orderInHistory: false })
      ).toEqual({
        action: "settle",
        newStatus: "PAID",
        sendConfirmation: true,
        cancelReminders: true,
      })
    }
  })
})
