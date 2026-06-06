import { type NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { apiSuccess, apiError, currentMonthYearInCenterTimezone, todayInCenterTimezone } from "@/lib/utils"
import { AppError } from "@/lib/errors"
import { getBillingSummary } from "@/features/payments/billing-summary"
import type { Invoice, PaymentReminder } from "@/features/payments/types"

/**
 * GET /api/students/billing?month=6&year=2026
 *
 * Returns an invoice-first map of studentId -> { invoice, reminders, summary, onLeave }
 * for the requested billing month. Works for all student statuses — the caller decides
 * which students to display. Students with no invoice show invoice: null.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const { month: currentMonth, year: currentYear } = currentMonthYearInCenterTimezone()
    const month = searchParams.get("month") ? Number(searchParams.get("month")) : currentMonth
    const year = searchParams.get("year") ? Number(searchParams.get("year")) : currentYear
    const today = todayInCenterTimezone()

    const supabase = await createSupabaseServerClient()

    const [{ data: invoices }, { data: leaves }] = await Promise.all([
      supabase
        .from("invoices")
        .select(
          "*, payment_reminders(id, reminder_number, scheduled_date, sent_at, status, message_preview)"
        )
        .eq("month", month)
        .eq("year", year),
      supabase
        .from("temporary_leaves")
        .select("student_id")
        .eq("month", month)
        .eq("year", year),
    ])

    const onLeaveIds = new Set((leaves ?? []).map((l) => l.student_id))

    // Build invoice map keyed by student_id
    const invoiceByStudent = new Map<string, { invoice: Invoice; reminders: PaymentReminder[] }>()
    for (const inv of invoices ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invAny = inv as any
      const reminders: PaymentReminder[] = invAny.payment_reminders ?? []
      invoiceByStudent.set(inv.student_id, { invoice: invAny as Invoice, reminders })
    }

    // Collect all student IDs that appear in invoices or leaves
    const studentIds = new Set([
      ...invoiceByStudent.keys(),
      ...onLeaveIds,
    ])

    const result: Record<
      string,
      {
        invoice: Invoice | null
        reminders: PaymentReminder[]
        summary: ReturnType<typeof getBillingSummary>
        onLeave: boolean
      }
    > = {}

    for (const studentId of studentIds) {
      const entry = invoiceByStudent.get(studentId)
      const invoice = entry?.invoice ?? null
      const reminders = entry?.reminders ?? []
      result[studentId] = {
        invoice,
        reminders,
        summary: getBillingSummary(invoice, reminders, today),
        onLeave: onLeaveIds.has(studentId),
      }
    }

    return apiSuccess({ month, year, billing: result })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
