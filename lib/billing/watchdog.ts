import {
  evaluateStudentBillingEligibility,
  getEffectiveInvoiceStatus,
  getStudentSubjects,
  type InvoiceStatusRow,
  type StudentSubjectRow,
} from "@/lib/billing/generate-eligibility"

// Pure billing-watchdog invariant: which billable students *should* have an active
// invoice this period but don't. By reusing the same eligibility predicates as
// generateMonthlyAutomated, the "missing" set is exactly what a generation run would
// create — so it is empty whenever generation has succeeded, and non-empty only when
// the (single-shot, no-backup) generate-invoices cron failed or was disabled.

export interface WatchdogStudent {
  id: string
  full_name: string
  enrolled_at: string
  student_subjects?: StudentSubjectRow[] | null
}

export interface MissingInvoice {
  id: string
  name: string
}

export function findMissingInvoices(input: {
  students: WatchdogStudent[]
  invoicesByStudent: Map<string, InvoiceStatusRow[]>
  onLeaveIds: Set<string>
  month: number
  year: number
}): MissingInvoice[] {
  const missing: MissingInvoice[] = []
  for (const student of input.students) {
    const subjects = getStudentSubjects(student)
    const invoiceStatus = getEffectiveInvoiceStatus(
      input.invoicesByStudent.get(student.id) ?? []
    )
    const { canGenerate } = evaluateStudentBillingEligibility({
      enrolledAt: student.enrolled_at,
      subjects,
      billingMonth: input.month,
      billingYear: input.year,
      onLeave: input.onLeaveIds.has(student.id),
      invoiceStatus,
    })
    // canGenerate === true means a generation run would create an invoice for this
    // student — and there isn't an active one — i.e. the invariant is violated.
    if (canGenerate) {
      missing.push({ id: student.id, name: student.full_name })
    }
  }
  return missing
}
