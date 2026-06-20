import type { PaymentStatus } from "@/features/payments/types"

// Pure CSV helpers for the payment-ledger export. RFC-4180 escaping so values
// containing commas/quotes/newlines (e.g. a student name with a comma) survive
// a spreadsheet round-trip.

// Guard against spreadsheet formula injection: a value starting with = + - @
// (or a control char) is treated as a formula by Excel/Sheets, so prefix it with
// an apostrophe. Our numeric columns are non-negative, so this only affects text.
function neutralizeFormula(field: string): string {
  return /^[=+\-@\t\r]/.test(field) ? `'${field}` : field
}

function escapeField(field: string): string {
  const safe = neutralizeFormula(field)
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
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
