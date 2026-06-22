import { type NextRequest } from "next/server"
import { paymentService } from "@/features/payments/service"
import { generateMonthlySchema } from "@/features/payments/validations"
import { apiSuccess, apiError } from "@/lib/utils"
import { AppError } from "@/lib/errors"
import { requireUser } from "@/lib/auth/user"

export async function POST(request: NextRequest) {
  const denied = await requireUser()
  if (denied) return denied
  try {
    const body = await request.json()
    const parsed = generateMonthlySchema.safeParse(body)
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", JSON.stringify(parsed.error.flatten()), 422)
    }

    const result = await paymentService.generateMonthly(parsed.data)
    return apiSuccess(result, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
