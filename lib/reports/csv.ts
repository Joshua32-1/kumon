import type { PaymentStatus } from "@/features/payments/types"

// Pure CSV helpers for the payment-ledger export. RFC-4180 escaping so values
// containing commas/quotes/newlines (e.g. a student name with a comma) survive
// a spreadsheet round-trip.

function escapeField(field: string): string {
  return /[",\n\r]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field
}

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeField).join(",")).join("\r\n")
}

export interface PaymentLedgerRow {
  month: number
  year: number
  student_name: string
  status: PaymentStatus
  amount: number
  paid_at: string | null
}

export const PAYMENT_LEDGER_HEADERS = [
  "Bulan",
  "Tahun",
  "Siswa",
  "Status",
  "Jumlah",
  "Dibayar pada",
]

export function buildPaymentLedgerRows(invoices: PaymentLedgerRow[]): string[][] {
  return invoices.map((inv) => [
    String(inv.month),
    String(inv.year),
    inv.student_name,
    inv.status,
    String(inv.amount),
    inv.paid_at ?? "",
  ])
}

export function buildPaymentLedgerCsv(invoices: PaymentLedgerRow[]): string {
  return toCsv(PAYMENT_LEDGER_HEADERS, buildPaymentLedgerRows(invoices))
}
