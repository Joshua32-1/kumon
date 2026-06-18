import type { PaymentStatus } from "@/features/payments/types"

// Pure Midtrans settlement decision logic (extracted from
// features/payments/service.ts). The service performs the DB writes; this module
// decides whether/how a settlement notification mutates the invoice.

/** A Midtrans notification is a successful, non-fraud payment. */
export function isValidMidtransSettlement(
  transactionStatus: string,
  fraudStatus?: string
): boolean {
  const isSuccess =
    transactionStatus === "settlement" || transactionStatus === "capture"
  return isSuccess && fraudStatus !== "deny"
}

/** Immutable de-duplicating append for an invoice's Midtrans order-id history. */
export function appendOrderId(
  existing: string[] | null | undefined,
  orderId: string
): string[] {
  const ids = existing ?? []
  if (ids.includes(orderId)) return ids
  return [...ids, orderId]
}

export type SettlementDecision =
  | { action: "already_settled"; status: PaymentStatus }
  | { action: "unrelated" }
  | {
      action: "settle"
      newStatus: Extract<PaymentStatus, "PAID" | "PAID_OLD_LINK">
      sendConfirmation: boolean
      cancelReminders: boolean
    }

/**
 * Decide how a settled order maps onto an invoice:
 * - already PAID/PAID_OLD_LINK → no-op
 * - order belongs to neither the current nor a historical order → unrelated
 * - CANCELLED/WAIVED → PAID_OLD_LINK (stale link paid; no confirmation/cancel)
 * - PENDING/OVERDUE via an old order → PAID_OLD_LINK (cancel reminders)
 * - PENDING/OVERDUE via the current order → PAID (confirm + cancel reminders)
 */
export function decideMidtransSettlement(options: {
  currentStatus: PaymentStatus
  isCurrentOrder: boolean
  orderInHistory: boolean
}): SettlementDecision {
  const { currentStatus, isCurrentOrder, orderInHistory } = options

  if (currentStatus === "PAID" || currentStatus === "PAID_OLD_LINK") {
    return { action: "already_settled", status: currentStatus }
  }

  if (!isCurrentOrder && !orderInHistory) {
    return { action: "unrelated" }
  }

  if (currentStatus === "CANCELLED" || currentStatus === "WAIVED") {
    return {
      action: "settle",
      newStatus: "PAID_OLD_LINK",
      sendConfirmation: false,
      cancelReminders: false,
    }
  }

  if ((currentStatus === "PENDING" || currentStatus === "OVERDUE") && !isCurrentOrder) {
    return {
      action: "settle",
      newStatus: "PAID_OLD_LINK",
      sendConfirmation: false,
      cancelReminders: true,
    }
  }

  if (currentStatus === "PENDING" || currentStatus === "OVERDUE") {
    return {
      action: "settle",
      newStatus: "PAID",
      sendConfirmation: true,
      cancelReminders: true,
    }
  }

  return { action: "unrelated" }
}
