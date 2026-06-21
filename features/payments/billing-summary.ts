import type { Invoice, PaymentReminder, MessageEventSummary } from "./types"

export type WhatsAppDeliveryStatus =
  | "not_applicable"  // no invoice (cuti / inactive / no subjects generated)
  | "no_link"         // invoice exists, no payment_access_token
  | "link_not_sent"   // link exists, zero SENT reminders (and no delivery failures)
  | "sent"            // at least one SENT reminder
  | "send_failed"     // at least one FAILED, none SENT
  | "partial_failed"  // mix of SENT and FAILED

/**
 * Downstream confirmation from Meta's delivery webhook (not the send-API result):
 * whether the message actually reached/was read by the parent, or failed Meta-side.
 * "awaiting" = at least one message sent, no delivery callback yet; "unknown" = no
 * tracked message at all (nothing sent, or sent before delivery tracking existed).
 */
export type WhatsAppDeliveryConfirmation =
  | "unknown"
  | "awaiting"
  | "delivered"
  | "read"
  | "failed"

/** Best (most-advanced) delivery confirmation across an invoice's message events. */
export function getDeliveryConfirmation(
  events: MessageEventSummary[]
): WhatsAppDeliveryConfirmation {
  if (events.some((e) => e.read_at || e.status === "READ")) return "read"
  if (events.some((e) => e.delivered_at || e.status === "DELIVERED")) return "delivered"
  if (events.some((e) => e.status === "FAILED")) return "failed"
  // Sent, but Meta hasn't confirmed delivery yet — distinct from "no message at all".
  if (events.length > 0) return "awaiting"
  return "unknown"
}

export type BillingAttention = "none" | "needs_action"

/**
 * "delivery" — operational problem: link missing, not sent, or send failed.
 * "collection" — sent but still unpaid (OVERDUE, or PENDING past due_date).
 * When both apply, "delivery" takes priority so the admin fixes ops first.
 */
export type AttentionReason = "delivery" | "collection" | null

export interface BillingSummary {
  whatsappStatus: WhatsAppDeliveryStatus
  deliveryStatus: WhatsAppDeliveryConfirmation
  attention: BillingAttention
  attentionReason: AttentionReason
  firstSentAt: string | null
}

/** Derive the WhatsApp delivery status from invoice + reminder records. */
export function getWhatsAppDeliveryStatus(
  invoice: Invoice | null,
  reminders: PaymentReminder[]
): WhatsAppDeliveryStatus {
  if (!invoice) return "not_applicable"
  if (!invoice.payment_access_token) return "no_link"

  const hasSent = reminders.some((r) => r.status === "SENT")
  const hasFailed = reminders.some((r) => r.status === "FAILED")

  if (hasSent && hasFailed) return "partial_failed"
  if (hasSent) return "sent"
  if (hasFailed) return "send_failed"
  return "link_not_sent"
}

/**
 * An invoice needs attention when it is unpaid AND one of:
 * - no pay link token yet, not sent, send failed, or a reminder stranded past its
 *   scheduled date (missed its send window) → "delivery"
 * - OVERDUE status, or PENDING past its due_date → "collection"
 *
 * When both conditions are true, reason is "delivery" (fix ops first).
 */
export function getBillingAttentionWithReason(
  invoice: Invoice | null,
  reminders: PaymentReminder[],
  today?: string,
  deliveryConfirmation?: WhatsAppDeliveryConfirmation
): { attention: BillingAttention; attentionReason: AttentionReason } {
  if (!invoice) return { attention: "none", attentionReason: null }
  if (
    invoice.status === "PAID" ||
    invoice.status === "PAID_OLD_LINK" ||
    invoice.status === "CANCELLED" ||
    invoice.status === "WAIVED"
  ) {
    return { attention: "none", attentionReason: null }
  }

  const waStatus = getWhatsAppDeliveryStatus(invoice, reminders)
  // A reminder still PENDING after its scheduled date missed its send window — normally the
  // supersede logic cancels these, so survivors mean the cron didn't run (disabled/outage) or the
  // invoice was created after all its reminder days. Surface it as a delivery problem.
  const hasStrandedReminder =
    today != null &&
    reminders.some((r) => r.status === "PENDING" && r.scheduled_date < today)
  const isDeliveryProblem =
    waStatus === "no_link" ||
    waStatus === "link_not_sent" ||
    waStatus === "send_failed" ||
    waStatus === "partial_failed" ||
    hasStrandedReminder ||
    // Meta confirmed the message failed downstream even though the send-API accepted it —
    // the parent never got it, so it needs the same attention as a send failure.
    deliveryConfirmation === "failed"

  const isCollectionProblem =
    invoice.status === "OVERDUE" ||
    (invoice.status === "PENDING" && today != null && invoice.due_date < today)

  if (isDeliveryProblem) {
    return { attention: "needs_action", attentionReason: "delivery" }
  }
  if (isCollectionProblem) {
    return { attention: "needs_action", attentionReason: "collection" }
  }

  return { attention: "none", attentionReason: null }
}

/** Backward-compatible wrapper that returns only BillingAttention. */
export function getBillingAttention(
  invoice: Invoice | null,
  reminders: PaymentReminder[]
): BillingAttention {
  return getBillingAttentionWithReason(invoice, reminders).attention
}

export function getBillingSummary(
  invoice: Invoice | null,
  reminders: PaymentReminder[],
  today?: string,
  messageEvents: MessageEventSummary[] = []
): BillingSummary {
  const whatsappStatus = getWhatsAppDeliveryStatus(invoice, reminders)
  const deliveryStatus = getDeliveryConfirmation(messageEvents)
  const { attention, attentionReason } = getBillingAttentionWithReason(
    invoice,
    reminders,
    today,
    deliveryStatus
  )
  const firstSent = reminders.find((r) => r.status === "SENT" && r.sent_at)
  return {
    whatsappStatus,
    deliveryStatus,
    attention,
    attentionReason,
    firstSentAt: firstSent?.sent_at ?? null,
  }
}

/** Human-readable label for a WhatsAppDeliveryStatus (Indonesian). */
export const WA_STATUS_LABELS: Record<WhatsAppDeliveryStatus, string> = {
  not_applicable: "—",
  no_link: "Belum ada link",
  link_not_sent: "Belum dikirim",
  sent: "Terkirim",
  send_failed: "Gagal dikirim",
  partial_failed: "Sebagian gagal",
}

/** Human-readable label for a delivery confirmation (Indonesian). */
export const DELIVERY_CONFIRMATION_LABELS: Record<WhatsAppDeliveryConfirmation, string> = {
  unknown: "—",
  awaiting: "Menunggu konfirmasi",
  delivered: "Tersampaikan",
  read: "Dibaca",
  failed: "Gagal terkirim",
}
