import { type NextRequest } from "next/server"
import { paymentService } from "@/features/payments/service"
import { updateInvoiceSchema } from "@/features/payments/validations"
import { apiSuccess, apiError } from "@/lib/utils"
import { AppError, Errors } from "@/lib/errors"
import { requireUser } from "@/lib/auth/user"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireUser()
  if (denied) return denied
  try {
    const { id } = await params
    const invoice = await paymentService.getById(id)
    return apiSuccess(invoice)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireUser()
  if (denied) return denied
  try {
    const { id } = await params
    const body = await request.json()
    const parsed = updateInvoiceSchema.safeParse(body)
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", JSON.stringify(parsed.error.flatten()), 422)
    }

    const { status, notes } = parsed.data

    let invoice
    if (status === "PAID") {
      invoice = await paymentService.markPaid(id)
    } else if (status === "WAIVED") {
      invoice = await paymentService.waive(id, notes ?? "")
    } else if (status === "CANCELLED") {
      invoice = await paymentService.cancel(id)
    } else {
      throw Errors.INVALID_STATUS()
    }

    return apiSuccess(invoice)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
