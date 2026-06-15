import { type NextRequest } from "next/server"
import { revalidatePath } from "next/cache"
import { studentService } from "@/features/students/service"
import { paymentService } from "@/features/payments/service"
import { setLeaveSchema } from "@/features/students/validations"
import { apiSuccess, apiError } from "@/lib/utils"
import { AppError } from "@/lib/errors"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const parsed = setLeaveSchema.safeParse(body)
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", JSON.stringify(parsed.error.flatten()), 422)
    }

    const { month, year, reason, cancel_unpaid_invoices } = parsed.data
    const leave = await studentService.setLeave(id, month, year, reason)

    // The leave row is committed and is the source of truth — cancellation
    // failure is reported via cancel_error, never turned into a 500 that would
    // imply the cuti wasn't recorded.
    let cancellation: Awaited<
      ReturnType<typeof paymentService.cancelUnpaidInvoicesForLeave>
    > = { cancelled: [], failed: [] }
    let cancel_error = false
    if (cancel_unpaid_invoices) {
      try {
        cancellation = await paymentService.cancelUnpaidInvoicesForLeave([id], month, year)
      } catch (err) {
        console.error(
          `POST leave: invoice cancellation failed after leave committed (student ${id}, ${month}/${year})`,
          err
        )
        cancel_error = true
      }
    }

    revalidatePath("/students")
    revalidatePath(`/students/${id}`)
    if (cancellation.cancelled.length > 0) {
      revalidatePath("/")
      revalidatePath("/payments")
      for (const inv of cancellation.cancelled) {
        revalidatePath(`/payments/${inv.invoice_id}`)
      }
    }

    return apiSuccess(
      {
        leave,
        cancelled_invoices: cancellation.cancelled,
        failed_invoices: cancellation.failed,
        cancel_error,
      },
      201
    )
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
