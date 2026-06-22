import { type NextRequest } from "next/server"
import { paymentService } from "@/features/payments/service"
import { apiSuccess, apiError } from "@/lib/utils"
import { AppError } from "@/lib/errors"
import { requireUser } from "@/lib/auth/user"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireUser()
  if (denied) return denied
  try {
    const { id } = await params
    const result = await paymentService.createCheckout(id)
    return apiSuccess(result)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
