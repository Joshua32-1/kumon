import { createSupabaseServerClient } from "@/lib/supabase/server"
import { todayInCenterTimezone } from "@/lib/utils"
import type { RevenueChartPeriod } from "@/lib/billing/revenue-chart"
import {
  summarizeCollectionRate,
  type CollectionInvoiceRow,
  type CollectionRateData,
} from "@/lib/reports/collection-rate"
import {
  buildArrearsAging,
  type ArrearsAgingRow,
  type ArrearsAgingSummary,
} from "@/lib/reports/arrears-aging"
import {
  summarizeEnrollmentChurn,
  type StudentLifecycleRow,
  type EnrollmentChurnData,
} from "@/lib/reports/enrollment-churn"
import {
  buildSubjectMix,
  type SubjectMixRow,
  type SubjectMixData,
} from "@/lib/reports/subject-mix"
import type { PaymentLedgerRow } from "@/lib/reports/csv"
import { BILLABLE_STUDENT_STATUSES } from "@/lib/constants"
import type { PaymentStatus } from "@/features/payments/types"

// Read-only reporting reads. Uses the cookie-session server client (dashboard
// context, RLS-scoped) and delegates all math to the pure helpers in lib/reports.
export const reportsService = {
  async collectionRate(period: RevenueChartPeriod): Promise<CollectionRateData> {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from("invoices")
      .select("month, year, amount, status")
      .returns<CollectionInvoiceRow[]>()
    if (error) throw error
    return summarizeCollectionRate(data ?? [], period)
  },

  async arrearsAging(): Promise<ArrearsAgingSummary> {
    const supabase = await createSupabaseServerClient()
    const today = todayInCenterTimezone()
    const { data, error } = await supabase
      .from("invoices")
      .select("status, due_date, amount")
      .in("status", ["PENDING", "OVERDUE"])
      .returns<ArrearsAgingRow[]>()
    if (error) throw error
    return buildArrearsAging(data ?? [], today)
  },

  async enrollmentChurn(period: RevenueChartPeriod): Promise<EnrollmentChurnData> {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from("students")
      .select("enrolled_at, deactivated_at")
      .returns<StudentLifecycleRow[]>()
    if (error) throw error
    return summarizeEnrollmentChurn(data ?? [], period)
  },

  async subjectMix(): Promise<SubjectMixData> {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from("students")
      .select("grade, student_subjects(subject)")
      .in("status", [...BILLABLE_STUDENT_STATUSES])
      .returns<{ grade: SubjectMixRow["grade"]; student_subjects: { subject: SubjectMixRow["subjects"][number] }[] | null }[]>()
    if (error) throw error
    const rows: SubjectMixRow[] = (data ?? []).map((s) => ({
      grade: s.grade,
      subjects: (s.student_subjects ?? []).map((ss) => ss.subject),
    }))
    return buildSubjectMix(rows)
  },

  async paymentLedger(options: {
    year: number
    status?: PaymentStatus
  }): Promise<PaymentLedgerRow[]> {
    const supabase = await createSupabaseServerClient()
    let query = supabase
      .from("invoices")
      .select("month, year, amount, status, paid_at, students(full_name)")
      .eq("year", options.year)
    if (options.status) query = query.eq("status", options.status)

    const { data, error } = await query.returns<
      {
        month: number
        year: number
        amount: number
        status: PaymentStatus
        paid_at: string | null
        students: { full_name: string } | null
      }[]
    >()
    if (error) throw error

    return (data ?? [])
      .map((inv) => ({
        month: inv.month,
        year: inv.year,
        student_name: inv.students?.full_name ?? "—",
        status: inv.status,
        amount: inv.amount,
        paid_at: inv.paid_at,
      }))
      .sort((a, b) =>
        a.month !== b.month
          ? a.month - b.month
          : a.student_name.localeCompare(b.student_name)
      )
  },
}
