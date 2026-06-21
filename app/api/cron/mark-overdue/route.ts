import { type NextRequest } from "next/server"
import { z } from "zod"
import { paymentService } from "@/features/payments/service"
import { verifyCronAuth } from "@/lib/auth/cron"
import { isCronJobEnabled } from "@/lib/cron/enabled"
import { apiSuccess, apiError } from "@/lib/utils"
import { AppError } from "@/lib/errors"
import { alertCronFailure } from "@/lib/alerts"

export const maxDuration = 60

const bodySchema = z
  .object({
    // Optional override (YYYY-MM-DD) to simulate a date when testing.
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .optional()

async function handleMarkOverdue(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return apiError("UNAUTHORIZED", "Unauthorized", 401)
  }

  if (!(await isCronJobEnabled("mark_overdue"))) {
    return apiSuccess({ skipped: true, reason: "cron_disabled" })
  }

  try {
    let today: string | undefined
    if (request.method === "POST") {
      try {
        const raw = await request.json()
        const parsed = bodySchema.safeParse(raw)
        if (parsed.success) today = parsed.data?.today
      } catch {
        // Empty body is fine — defaults to WIB today.
      }
    }

    const result = await paymentService.markOverdueByDueDate(today)
    return apiSuccess(result)
  } catch (err) {
    await alertCronFailure("mark-overdue", err)
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}

export async function GET(request: NextRequest) {
  return handleMarkOverdue(request)
}

export async function POST(request: NextRequest) {
  return handleMarkOverdue(request)
}
