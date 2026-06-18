import type { Invoice, PaymentReminder } from "@/features/payments/types"

// Fully-typed fixtures for the arrears and billing-summary tests. Defaults
// describe a plain unpaid PENDING invoice with a pay-link token; override only
// the fields a given case cares about. Not a *.test.ts file, so Vitest does not
// collect it as a suite.

export function makeInvoice(partial: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-1",
    student_id: "stu-1",
    month: 6,
    year: 2026,
    amount: 480_000,
    status: "PENDING",
    due_date: "2026-06-30",
    paid_at: null,
    midtrans_order_id: null,
    midtrans_payment_url: null,
    midtrans_transaction_id: null,
    midtrans_order_ids: [],
    payment_access_token: "tok-1",
    midtrans_snap_created_at: null,
    school_level_at_billing: "ELEMENTARY",
    notes: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    ...partial,
  }
}

export function makeReminder(partial: Partial<PaymentReminder> = {}): PaymentReminder {
  return {
    id: "rem-1",
    invoice_id: "inv-1",
    student_id: "stu-1",
    reminder_number: 1,
    scheduled_date: "2026-06-01",
    sent_at: null,
    status: "PENDING",
    whatsapp_number: "+6281234567890",
    message_preview: null,
    ...partial,
  }
}
