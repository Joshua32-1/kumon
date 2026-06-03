import { type NextRequest } from "next/server"
import { z } from "zod"
import { paymentService } from "@/features/payments/service"
import { verifyCronAuth } from "@/lib/auth/cron"
import { apiSuccess, apiError } from "@/lib/utils"
import { AppError } from "@/lib/errors"

const bodySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .optional()

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return apiError("UNAUTHORIZED", "Unauthorized", 401)
  }

  try {
    let date: string | undefined
    try {
      const raw = await request.json()
      const parsed = bodySchema.safeParse(raw)
      if (parsed.success) date = parsed.data?.date
    } catch {
      // Empty body — use today's date in WIB
    }

    const result = await paymentService.processDueReminders(date)
    return apiSuccess(result)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
