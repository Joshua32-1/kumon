import type { Invoice, PaymentReminder } from "./types"

export type WhatsAppDeliveryStatus =
  | "not_applicable"  // no invoice (cuti / inactive / no subjects generated)
  | "no_link"         // invoice exists, no midtrans_payment_url
  | "link_not_sent"   // link exists, zero SENT reminders (and no delivery failures)
  | "sent"            // at least one SENT reminder
  | "send_failed"     // at least one FAILED, none SENT
  | "partial_failed"  // mix of SENT and FAILED

export type BillingAttention = "none" | "needs_action"

/**
 * "delivery" — operational problem: link missing, not sent, or send failed.
 * "collection" — sent but still unpaid (OVERDUE, or PENDING past due_date).
 * When both apply, "delivery" takes priority so the admin fixes ops first.
 */
export type AttentionReason = "delivery" | "collection" | null

export interface BillingSummary {
  whatsappStatus: WhatsAppDeliveryStatus
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
  if (!invoice.midtrans_payment_url) return "no_link"

  const hasSent = reminders.some((r) => r.status === "SENT")
  const hasFailed = reminders.some((r) => r.status === "FAILED")

  if (hasSent && hasFailed) return "partial_failed"
  if (hasSent) return "sent"
  if (hasFailed) return "send_failed"
  return "link_not_sent"
}

/**
 * An invoice needs attention when it is unpaid AND one of:
 * - no Midtrans link yet, not sent, or send failed → "delivery"
 * - OVERDUE status, or PENDING past its due_date → "collection"
 *
 * When both conditions are true, reason is "delivery" (fix ops first).
 */
export function getBillingAttentionWithReason(
  invoice: Invoice | null,
  reminders: PaymentReminder[],
  today?: string
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
  const isDeliveryProblem =
    waStatus === "no_link" ||
    waStatus === "link_not_sent" ||
    waStatus === "send_failed" ||
    waStatus === "partial_failed"

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
  today?: string
): BillingSummary {
  const whatsappStatus = getWhatsAppDeliveryStatus(invoice, reminders)
  const { attention, attentionReason } = getBillingAttentionWithReason(invoice, reminders, today)
  const firstSent = reminders.find((r) => r.status === "SENT" && r.sent_at)
  return {
    whatsappStatus,
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
