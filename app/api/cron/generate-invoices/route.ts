import { type NextRequest } from "next/server"
import { z } from "zod"
import { paymentService } from "@/features/payments/service"
import { verifyCronAuth } from "@/lib/auth/cron"
import { isCronJobEnabled } from "@/lib/cron/enabled"
import { apiSuccess, apiError, currentMonthYearInCenterTimezone } from "@/lib/utils"
import { AppError } from "@/lib/errors"
import { alertCronFailure } from "@/lib/alerts"

// Invoice + payment token creation per billable student (no Midtrans at generation)
export const maxDuration = 120

const bodySchema = z
  .object({
    month: z.number().int().min(1).max(12).optional(),
    year: z.number().int().min(2020).optional(),
  })
  .optional()

async function handleGenerateInvoices(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return apiError("UNAUTHORIZED", "Unauthorized", 401)
  }

  if (!(await isCronJobEnabled("generate_invoices"))) {
    return apiSuccess({ skipped: true, reason: "cron_disabled" })
  }

  try {
    let body: z.infer<typeof bodySchema> = undefined
    if (request.method === "POST") {
      try {
        const raw = await request.json()
        const parsed = bodySchema.safeParse(raw)
        if (parsed.success) body = parsed.data
      } catch {
        // Empty body is fine — defaults to current month in WIB
      }
    }

    const defaults = currentMonthYearInCenterTimezone()
    const month = body?.month ?? defaults.month
    const year = body?.year ?? defaults.year

    const result = await paymentService.generateMonthlyAutomated({ month, year })

    return apiSuccess(result, result.generated > 0 ? 201 : 200)
  } catch (err) {
    // Singleton cron (runs on the 1st; only the day-1 retry schedule backs it up):
    // alert the admin on a genuine failure. The billing-watchdog is the daily backstop.
    await alertCronFailure("generate-invoices", err)
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}

export async function GET(request: NextRequest) {
  return handleGenerateInvoices(request)
}

export async function POST(request: NextRequest) {
  return handleGenerateInvoices(request)
}
