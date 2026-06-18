import type { KumonSubject } from "@/lib/billing/fees"
import type { PaymentStatus, GenerateInvoiceCategory } from "@/features/payments/types"
import { GENERATABLE_INVOICE_CATEGORIES } from "@/features/payments/types"
import {
  isBillingPeriodBeforeEnrollment,
  filterSubjectsForBillingPeriod,
} from "@/lib/billing/billing-period"

// Pure invoice-generation eligibility logic (extracted from
// features/payments/service.ts). Decides whether a student should receive an
// invoice for a billing period, and how an existing invoice maps to a category.

/** Statuses that block (re)generating an invoice for the same period. */
export const BLOCKING_INVOICE_STATUSES = ["CANCELLED", "PAID_OLD_LINK"] as const

export type InvoiceStatusRow = {
  student_id: string
  status: PaymentStatus
  created_at: string
}

export type StudentSubjectRow = { subject: KumonSubject; enrolled_at: string }

export function getStudentSubjects(student: {
  student_subjects?: StudentSubjectRow[] | null
}): StudentSubjectRow[] {
  return (student.student_subjects ?? []).map((ss) => ({
    subject: ss.subject,
    enrolled_at: ss.enrolled_at,
  }))
}

export function evaluateStudentBillingEligibility(options: {
  enrolledAt: string
  subjects: StudentSubjectRow[]
  billingMonth: number
  billingYear: number
  onLeave: boolean
  invoiceStatus: PaymentStatus | null
}) {
  const beforeEnrollment = isBillingPeriodBeforeEnrollment(
    options.enrolledAt,
    options.billingMonth,
    options.billingYear
  )
  const billableSubjects = beforeEnrollment
    ? []
    : filterSubjectsForBillingPeriod(
        options.subjects,
        options.billingMonth,
        options.billingYear
      )
  const hasSubjects = billableSubjects.length > 0
  const canGenerate =
    !beforeEnrollment &&
    canGenerateInvoiceForStudent({
      onLeave: options.onLeave,
      hasSubjects,
      invoiceStatus: options.invoiceStatus,
    })

  return { beforeEnrollment, hasSubjects, billableSubjects, canGenerate }
}

export function getEffectiveInvoiceStatus(
  invoices: InvoiceStatusRow[]
): PaymentStatus | null {
  if (invoices.length === 0) return null

  const active = invoices.find(
    (inv) =>
      !BLOCKING_INVOICE_STATUSES.includes(
        inv.status as (typeof BLOCKING_INVOICE_STATUSES)[number]
      )
  )
  if (active) return active.status

  const sorted = [...invoices].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  return sorted[0]?.status ?? null
}

export function invoiceStatusToCategory(
  status: PaymentStatus | null
): GenerateInvoiceCategory {
  return status ?? "no_invoice"
}

export function canGenerateInvoiceForStudent(options: {
  onLeave: boolean
  hasSubjects: boolean
  invoiceStatus: PaymentStatus | null
}): boolean {
  if (options.onLeave || !options.hasSubjects) return false
  const category = invoiceStatusToCategory(options.invoiceStatus)
  return GENERATABLE_INVOICE_CATEGORIES.includes(category)
}

export function studentMatchesGenerateCategories(
  invoiceStatus: PaymentStatus | null,
  categories: GenerateInvoiceCategory[]
): boolean {
  return categories.includes(invoiceStatusToCategory(invoiceStatus))
}
