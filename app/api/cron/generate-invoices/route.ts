import { type NextRequest } from "next/server"
import { z } from "zod"
import { paymentService } from "@/features/payments/service"
import { verifyCronAuth } from "@/lib/auth/cron"
import { apiSuccess, apiError, currentMonthYearInCenterTimezone } from "@/lib/utils"
import { AppError } from "@/lib/errors"

const bodySchema = z
  .object({
    month: z.number().int().min(1).max(12).optional(),
    year: z.number().int().min(2020).optional(),
    amount: z.number().int().positive().optional(),
  })
  .optional()

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return apiError("UNAUTHORIZED", "Unauthorized", 401)
  }

  try {
    let body: z.infer<typeof bodySchema> = undefined
    try {
      const raw = await request.json()
      const parsed = bodySchema.safeParse(raw)
      if (parsed.success) body = parsed.data
    } catch {
      // Empty body is fine — defaults to current month in WIB
    }

    const defaults = currentMonthYearInCenterTimezone()
    const month = body?.month ?? defaults.month
    const year = body?.year ?? defaults.year

    const result = await paymentService.generateMonthlyAutomated({
      month,
      year,
      amount: body?.amount,
    })

    return apiSuccess(result, result.generated > 0 ? 201 : 200)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
