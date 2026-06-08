import type { KumonSubject, SchoolLevel } from "@/lib/billing/fees"

export type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED"
  | "WAIVED"
  | "PAID_OLD_LINK"
export type ReminderStatus = "PENDING" | "SENT" | "FAILED" | "CANCELLED"

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
  midtrans_order_ids: string[]
  payment_access_token: string
  midtrans_snap_created_at: string | null
  school_level_at_billing: SchoolLevel
  notes: string | null
  created_at: string
  updated_at: string
}

export interface InvoiceLineItem {
  id: string
  invoice_id: string
  subject: KumonSubject
  label: string
  unit_amount: number
  created_at: string
}

export interface InvoiceWithStudent extends Invoice {
  students: {
    full_name: string
    school_level?: SchoolLevel
    contacts: Array<{ whatsapp_number: string; is_primary: boolean; full_name?: string }>
  }
  invoice_line_items?: InvoiceLineItem[]
  payment_reminders?: PaymentReminder[]
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

export type GenerateInvoiceCategory = PaymentStatus | "no_invoice"

export const GENERATABLE_INVOICE_CATEGORIES: GenerateInvoiceCategory[] = [
  "no_invoice",
  "CANCELLED",
  "PAID_OLD_LINK",
]

export const DEFAULT_GENERATE_CATEGORIES: GenerateInvoiceCategory[] = [
  "no_invoice",
  "CANCELLED",
  "PAID_OLD_LINK",
]

export interface GenerateMonthlyInput {
  month: number
  year: number
  categories?: GenerateInvoiceCategory[]
  student_ids?: string[]
}

export interface GenerateCandidate {
  student_id: string
  full_name: string
  student_status: "ACTIVE" | "TEMPORARY_LEAVE"
  enrolled_at: string
  invoice_status: PaymentStatus | null
  on_leave: boolean
  has_subjects: boolean
  before_enrollment: boolean
  can_generate: boolean
}

export interface GeneratePeriodInfo {
  is_past: boolean
  fee_effective_month: number | null
  fee_effective_year: number | null
}

export interface GenerateCandidatesResult {
  candidates: GenerateCandidate[]
  period: GeneratePeriodInfo
}

export interface CheckoutLinksResult {
  created: number
  failed: number
  failed_ids: string[]
}

export interface GenerateResult {
  generated: number
  skipped_on_leave: number
  skipped_existing: number
  skipped_no_subjects: number
  skipped_before_enrollment: number
  skipped_not_selected?: number
  invoice_ids: string[]
  payment_links_created?: number
  payment_links_failed?: number
  payment_link_failed_ids?: string[]
  marked_overdue: number
}

export interface BackfillLinksResult extends CheckoutLinksResult {
  attempted: number
  month?: number
  year?: number
}

export interface ReminderProcessResult {
  processed: number
  sent: number
  failed: number
  skipped: number
  slot?: number
  truncated?: boolean
  includeOverdueChase?: boolean
}

export interface PaymentLinkSendCandidate {
  invoice_id: string
  student_name: string
}

export interface PaymentLinkSendCandidatesResult {
  month: number
  year: number
  eligible: number
  already_sent: number
  no_whatsapp: number
  no_link: number
  candidates: PaymentLinkSendCandidate[]
}

export interface SendPaymentLinksResult extends ReminderProcessResult {
  month: number
  year: number
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

export interface MidtransWebhookResult {
  handled: boolean
  status?: PaymentStatus
  sendConfirmation: boolean
  invoiceId?: string
}

export interface MidtransSettlementInput {
  order_id: string
  transaction_id?: string | null
  transaction_status: string
  fraud_status?: string
}

export interface ReconcileInvoiceResult {
  ok: boolean
  synced: boolean
  status?: PaymentStatus
  message: string
}

export interface ReconcileBatchResult {
  checked: number
  synced: number
  errors: Array<{ invoiceId: string; error: string }>
}
