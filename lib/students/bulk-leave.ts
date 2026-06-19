import type { SetLeaveBulkResult, BulkLeaveUnpaidInvoice } from "@/features/students/types"

/**
 * Shape of the rows returned by the bulk-leave invoice lookup
 * (`invoices.select("id, student_id, amount, status, students(full_name)")`).
 * `students` is left as `unknown` because Supabase's generated type for an
 * embedded relation does not narrow cleanly; the cast happens here, once.
 */
export type BulkLeaveInvoiceRow = {
  id: string
  student_id: string
  amount: number
  status: string
  students: unknown
}

/**
 * Pure assembly of the bulk-leave result: count arithmetic plus the unpaid/paid
 * categorization of the affected invoices. `cancelled_invoices` is always empty
 * here — the action layer fills it when the admin opts into cancellation.
 */
export function buildSetLeaveBulkResult(params: {
  studentIds: string[]
  eligibleIds: string[]
  created: number
  invoiceRows: BulkLeaveInvoiceRow[]
}): SetLeaveBulkResult {
  const { studentIds, eligibleIds, created, invoiceRows } = params

  const reported: BulkLeaveUnpaidInvoice[] = invoiceRows.map((row) => ({
    invoice_id: row.id,
    student_id: row.student_id,
    student_name: (row.students as { full_name: string } | null)?.full_name ?? "",
    amount: row.amount,
    status: row.status as BulkLeaveUnpaidInvoice["status"],
  }))

  return {
    created,
    skipped_existing: eligibleIds.length - created,
    skipped_ineligible: studentIds.length - eligibleIds.length,
    unpaid_invoices: reported.filter((inv) => inv.status !== "PAID"),
    // Filled by the action when the admin opted into cancellation.
    cancelled_invoices: [],
    paid_invoices: reported.filter((inv) => inv.status === "PAID"),
  }
}
