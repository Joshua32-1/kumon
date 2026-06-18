import { BILLABLE_STUDENT_STATUSES } from "@/lib/constants"
import type { PaymentStatus } from "@/features/payments/types"

// Pure access-gating decision for the parent-facing /pay/{token} page (extracted
// from features/payments/service.ts). The service resolves the invoice, the leave
// flag (only for CANCELLED) and the student status (only for PENDING/OVERDUE),
// then this decides the outcome; "proceed" means open Midtrans checkout.

export type PayPageAccess =
  | { kind: "proceed" }
  | { kind: "message"; title: string; body: string }

export function evaluatePayPageAccess(options: {
  invoiceStatus: PaymentStatus
  hasLeaveForPeriod: boolean
  studentStatus?: string
}): PayPageAccess {
  const { invoiceStatus, hasLeaveForPeriod, studentStatus } = options

  if (invoiceStatus === "PAID" || invoiceStatus === "PAID_OLD_LINK") {
    return {
      kind: "message",
      title: "Sudah lunas",
      body: "Tagihan ini sudah dibayar. Terima kasih.",
    }
  }

  if (invoiceStatus === "CANCELLED") {
    if (hasLeaveForPeriod) {
      return {
        kind: "message",
        title: "Siswa sedang cuti",
        body: "Siswa sedang cuti pada bulan ini, jadi tidak ada tagihan yang perlu dibayar. Hubungi pusat Kumon jika ada pertanyaan.",
      }
    }
    return {
      kind: "message",
      title: "Tagihan dibatalkan",
      body: "Tagihan ini telah dibatalkan. Hubungi pusat Kumon jika ada pertanyaan.",
    }
  }

  if (invoiceStatus === "WAIVED") {
    return {
      kind: "message",
      title: "Tagihan dibebaskan",
      body: "Tagihan ini telah dibebaskan. Tidak perlu melakukan pembayaran.",
    }
  }

  if (invoiceStatus !== "PENDING" && invoiceStatus !== "OVERDUE") {
    return {
      kind: "message",
      title: "Tidak dapat membayar",
      body: "Tagihan ini tidak dapat dibayar saat ini.",
    }
  }

  if (
    !studentStatus ||
    !(BILLABLE_STUDENT_STATUSES as readonly string[]).includes(studentStatus)
  ) {
    return {
      kind: "message",
      title: "Tidak dapat membayar",
      body: "Status siswa tidak aktif. Hubungi pusat Kumon untuk bantuan.",
    }
  }

  return { kind: "proceed" }
}
