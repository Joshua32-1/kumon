export type PaymentStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED" | "WAIVED"
export type ReminderStatus = "PENDING" | "SENT" | "FAILED"

export interface Invoice {
  id: string
  student_id: string
  month: number
  year: number
  amount: number
  status: PaymentStatus
  due_date: string
  paid_at: string | null
  midtrans_order_id: string | null
  midtrans_payment_url: string | null
  midtrans_transaction_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface InvoiceWithStudent extends Invoice {
  students: {
    full_name: string
    contacts: Array<{ whatsapp_number: string; is_primary: boolean }>
  }
}

export interface PaymentReminder {
  id: string
  invoice_id: string
  student_id: string
  reminder_number: number
  scheduled_date: string
  sent_at: string | null
  status: ReminderStatus
  whatsapp_number: string
  message_preview: string | null
}

export interface GenerateMonthlyInput {
  month: number
  year: number
  amount?: number
}

export interface GenerateResult {
  generated: number
  skipped_on_leave: number
  skipped_existing: number
  invoice_ids: string[]
  payment_links_created?: number
}

export interface ReminderProcessResult {
  processed: number
  sent: number
  failed: number
  skipped: number
}

export interface PaymentFilters {
  status?: PaymentStatus
  month?: number
  year?: number
  student_id?: string
}

export interface MidtransWebhookPayload {
  order_id: string
  status_code: string
  gross_amount: string
  signature_key: string
  transaction_status: string
  fraud_status?: string
  transaction_id?: string
}
