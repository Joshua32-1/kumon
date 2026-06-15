"use server"

import { revalidatePath } from "next/cache"
import { studentService } from "./service"
import { paymentService } from "@/features/payments/service"
import type { LeaveMonthInvoice } from "@/features/payments/types"
import { currentMonthYearInCenterTimezone, isPriorBillingPeriod } from "@/lib/utils"
import { AppError } from "@/lib/errors"
import {
  createStudentSchema,
  updateStudentSchema,
  updateEnrollmentSchema,
  updateContactSchema,
  setLeaveSchema,
  setLeaveBulkSchema,
  cancelLeaveSchema,
} from "./validations"
import type {
  CreateStudentInput,
  UpdateStudentInput,
  UpdateEnrollmentInput,
  UpdateContactInput,
  SetLeaveBulkInput,
} from "./types"

export async function createStudentAction(input: CreateStudentInput) {
  const parsed = createStudentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  const student = await studentService.create(parsed.data as CreateStudentInput)
  revalidatePath("/students")
  return { data: student }
}

export async function updateStudentAction(id: string, input: UpdateStudentInput) {
  const parsed = updateStudentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  const student = await studentService.update(id, parsed.data)
  revalidatePath("/students")
  revalidatePath(`/students/${id}`)
  return { data: student }
}

export async function updateEnrollmentAction(id: string, input: UpdateEnrollmentInput) {
  const parsed = updateEnrollmentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  await studentService.updateEnrollment(id, parsed.data)
  revalidatePath("/students")
  revalidatePath(`/students/${id}`)
  return { data: true }
}

export async function updateContactAction(id: string, input: UpdateContactInput) {
  const parsed = updateContactSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  const contact = await studentService.updatePrimaryContact(id, parsed.data)
  revalidatePath("/students")
  revalidatePath(`/students/${id}`)
  return { data: contact }
}

export async function deactivateStudentAction(id: string) {
  await studentService.deactivate(id)
  revalidatePath("/students")
  revalidatePath(`/students/${id}`)
  return { data: true }
}

export async function reactivateStudentAction(id: string) {
  await studentService.reactivate(id)
  revalidatePath("/students")
  revalidatePath(`/students/${id}`)
  return { data: true }
}

export async function setLeaveAction(
  studentId: string,
  month: number,
  year: number,
  reason?: string,
  cancelUnpaidInvoices: boolean = true
) {
  const parsed = setLeaveSchema.safeParse({
    month,
    year,
    reason,
    cancel_unpaid_invoices: cancelUnpaidInvoices,
  })
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  const leave = await studentService.setLeave(studentId, month, year, reason)

  // Invoice cancellation lives in the payments domain; the action composes the
  // two services so studentService never imports paymentService.
  // The leave row is already committed and is the source of truth — a failure
  // cancelling invoices must NOT reject the action (that would falsely tell the
  // admin the cuti wasn't recorded). Surface it as a manual-followup flag instead.
  let cancelledInvoices: LeaveMonthInvoice[] = []
  let failedInvoices: LeaveMonthInvoice[] = []
  let cancelError = false
  if (parsed.data.cancel_unpaid_invoices) {
    try {
      const { cancelled, failed } = await paymentService.cancelUnpaidInvoicesForLeave(
        [studentId],
        month,
        year
      )
      cancelledInvoices = cancelled
      failedInvoices = failed
    } catch (err) {
      console.error(
        `setLeaveAction: invoice cancellation failed after leave committed (student ${studentId}, ${month}/${year})`,
        err
      )
      cancelError = true
    }
  }

  revalidatePath("/students")
  revalidatePath(`/students/${studentId}`)
  if (cancelledInvoices.length > 0) {
    revalidatePath("/")
    revalidatePath("/payments")
    for (const inv of cancelledInvoices) {
      revalidatePath(`/payments/${inv.invoice_id}`)
    }
  }
  return {
    data: {
      leave,
      cancelled_invoices: cancelledInvoices,
      failed_invoices: failedInvoices,
      cancel_error: cancelError,
    },
  }
}

export async function setLeaveBulkAction(input: SetLeaveBulkInput) {
  const parsed = setLeaveBulkSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  const result = await studentService.setLeaveBulk(
    parsed.data.student_ids,
    parsed.data.month,
    parsed.data.year,
    parsed.data.reason
  )

  if (parsed.data.cancel_unpaid_invoices && result.unpaid_invoices.length > 0) {
    const snapshot = result.unpaid_invoices
    // The bulk leaves are already committed and are the source of truth. If
    // cancellation fails wholesale, leave unpaid_invoices as the snapshot so the
    // result screen's manual-action section applies — never reject the action.
    try {
      const { cancelled, failed } = await paymentService.cancelUnpaidInvoicesForLeave(
        snapshot.map((inv) => inv.student_id),
        parsed.data.month,
        parsed.data.year
      )

      // Reconcile the race window: an invoice can be paid (or cancelled elsewhere)
      // between setLeaveBulk's snapshot and cancelUnpaidInvoicesForLeave's re-query,
      // landing in neither cancelled nor failed. Re-check those so the report can't
      // silently drop them (a now-PAID one is also a paid-leave conflict on the dashboard).
      const accounted = new Set(
        [...cancelled, ...failed].map((inv) => inv.invoice_id)
      )
      const missing = snapshot.filter((inv) => !accounted.has(inv.invoice_id))
      const reconciledCancelled: typeof result.cancelled_invoices = [...cancelled]
      const reconciledPaid: typeof result.paid_invoices = []
      if (missing.length > 0) {
        const statuses = await paymentService.getInvoiceStatusesByIds(
          missing.map((inv) => inv.invoice_id)
        )
        const statusById = new Map(statuses.map((s) => [s.invoice_id, s.status]))
        for (const inv of missing) {
          const status = statusById.get(inv.invoice_id)
          if (status === "PAID") {
            reconciledPaid.push({ ...inv, status: "PAID" })
          } else if (status === "CANCELLED") {
            // Carries its pre-cancel status like the rest of cancelled_invoices
            // (only the count is rendered); CANCELLED is outside this union.
            reconciledCancelled.push(inv)
          }
          // WAIVED / PAID_OLD_LINK / not found: resolved by other means — dropped.
        }
      }

      // Mutate result only after all fallible work succeeds, so a throw above
      // leaves result.unpaid_invoices as the original snapshot (set by setLeaveBulk).
      result.cancelled_invoices = reconciledCancelled
      result.unpaid_invoices = failed
      result.paid_invoices.push(...reconciledPaid)
    } catch (err) {
      console.error(
        `setLeaveBulkAction: invoice cancellation failed after leaves committed (${parsed.data.month}/${parsed.data.year})`,
        err
      )
      // result.unpaid_invoices is still the snapshot → manual-action UI applies.
    }
  }

  revalidatePath("/students")
  for (const studentId of parsed.data.student_ids) {
    revalidatePath(`/students/${studentId}`)
  }
  if (result.cancelled_invoices.length > 0) {
    revalidatePath("/")
    revalidatePath("/payments")
    for (const inv of result.cancelled_invoices) {
      revalidatePath(`/payments/${inv.invoice_id}`)
    }
  }
  return { data: result }
}

export async function cancelLeaveAction(
  leaveId: string,
  studentId: string,
  input?: { regenerate_invoice?: boolean }
) {
  const parsed = cancelLeaveSchema.safeParse(input ?? {})
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  // The returned period comes from the DB row — regeneration must not trust
  // client-supplied month/year.
  const leave = await studentService.cancelLeave(leaveId)

  let regeneratedInvoiceId: string | null = null
  let regenerateSkippedReason: "past_month" | "not_generated" | null = null
  let regenerateError: string | null = null

  if (parsed.data.regenerate_invoice) {
    const current = currentMonthYearInCenterTimezone()
    if (isPriorBillingPeriod(leave.month, leave.year, current.month, current.year)) {
      regenerateSkippedReason = "past_month"
    } else {
      // The leave row is already deleted above, so generateMonthly no longer
      // skips this student as on-leave. Failures must not reach the caller as
      // a rejection: the cuti cancellation has already committed.
      try {
        const result = await paymentService.generateMonthly({
          month: leave.month,
          year: leave.year,
          student_ids: [leave.student_id],
        })
        if (result.generated === 1) {
          regeneratedInvoiceId = result.invoice_ids[0]
        } else {
          regenerateSkippedReason = "not_generated"
        }
      } catch (err) {
        regenerateError =
          err instanceof AppError ? err.message : "Gagal membuat ulang tagihan."
      }
    }
  }

  revalidatePath("/students")
  revalidatePath(`/students/${studentId}`)
  if (regeneratedInvoiceId) {
    revalidatePath("/")
    revalidatePath("/payments")
    revalidatePath(`/payments/${regeneratedInvoiceId}`)
  }
  return {
    data: {
      month: leave.month,
      year: leave.year,
      regenerated_invoice_id: regeneratedInvoiceId,
      regenerate_skipped_reason: regenerateSkippedReason,
      regenerate_error: regenerateError,
    },
  }
}
