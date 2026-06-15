import { type NextRequest } from "next/server"
import { revalidatePath } from "next/cache"
import { studentService } from "@/features/students/service"
import { paymentService } from "@/features/payments/service"
import { cancelLeaveSchema } from "@/features/students/validations"
import {
  apiSuccess,
  apiError,
  currentMonthYearInCenterTimezone,
  isPriorBillingPeriod,
} from "@/lib/utils"
import { AppError } from "@/lib/errors"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; leaveId: string }> }
) {
  try {
    const { id, leaveId } = await params
    const parsed = cancelLeaveSchema.safeParse({
      regenerate_invoice:
        request.nextUrl.searchParams.get("regenerate_invoice") === "true",
    })
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", JSON.stringify(parsed.error.flatten()), 422)
    }

    const leave = await studentService.cancelLeave(leaveId)

    let regenerated_invoice_id: string | null = null
    let regenerate_skipped_reason: "past_month" | "not_generated" | null = null
    let regenerate_error: string | null = null

    if (parsed.data.regenerate_invoice) {
      const current = currentMonthYearInCenterTimezone()
      if (isPriorBillingPeriod(leave.month, leave.year, current.month, current.year)) {
        regenerate_skipped_reason = "past_month"
      } else {
        // The cuti deletion has already committed — regeneration failures are
        // reported in the response body, never as a request failure.
        try {
          const result = await paymentService.generateMonthly({
            month: leave.month,
            year: leave.year,
            student_ids: [leave.student_id],
          })
          if (result.generated === 1) {
            regenerated_invoice_id = result.invoice_ids[0]
          } else {
            regenerate_skipped_reason = "not_generated"
          }
        } catch (err) {
          regenerate_error =
            err instanceof AppError ? err.message : "Gagal membuat ulang tagihan."
        }
      }
    }

    revalidatePath("/students")
    revalidatePath(`/students/${id}`)
    if (regenerated_invoice_id) {
      revalidatePath("/")
      revalidatePath("/payments")
      revalidatePath(`/payments/${regenerated_invoice_id}`)
    }

    return apiSuccess({
      leaveId,
      month: leave.month,
      year: leave.year,
      regenerated_invoice_id,
      regenerate_skipped_reason,
      regenerate_error,
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
