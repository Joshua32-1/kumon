import { type NextRequest } from "next/server"
import { paymentService } from "@/features/payments/service"
import { generateMonthlySchema } from "@/features/payments/validations"
import { apiSuccess, apiError } from "@/lib/utils"
import { AppError } from "@/lib/errors"

export async function POST(request: NextRequest) {
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
