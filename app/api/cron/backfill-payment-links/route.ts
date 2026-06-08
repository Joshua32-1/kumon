import { type NextRequest } from "next/server"
import { z } from "zod"
import { paymentService } from "@/features/payments/service"
import { verifyCronAuth } from "@/lib/auth/cron"
import { isCronJobEnabled } from "@/lib/cron/enabled"
import { apiSuccess, apiError } from "@/lib/utils"
import { AppError } from "@/lib/errors"

// Assigns missing payment_access_token for unpaid invoices (no Midtrans calls)
export const maxDuration = 60

const bodySchema = z
  .object({
    month: z.number().int().min(1).max(12).optional(),
    year: z.number().int().min(2020).optional(),
    batch_limit: z.number().int().min(1).max(200).optional(),
  })
  .optional()

async function handleBackfillPaymentLinks(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return apiError("UNAUTHORIZED", "Unauthorized", 401)
  }

  if (!(await isCronJobEnabled("backfill_payment_links"))) {
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
        // Empty body is fine — processes oldest unpaid invoices missing links
      }
    }

    const result = await paymentService.backfillMissingPaymentLinks({
      month: body?.month,
      year: body?.year,
      batchLimit: body?.batch_limit,
    })

    return apiSuccess(result, result.created > 0 ? 201 : 200)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}

export async function GET(request: NextRequest) {
  return handleBackfillPaymentLinks(request)
}

export async function POST(request: NextRequest) {
  return handleBackfillPaymentLinks(request)
}
