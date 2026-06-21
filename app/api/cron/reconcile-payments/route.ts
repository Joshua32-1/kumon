import { type NextRequest } from "next/server"
import { paymentService } from "@/features/payments/service"
import { verifyCronAuth } from "@/lib/auth/cron"
import { isCronJobEnabled } from "@/lib/cron/enabled"
import { apiSuccess, apiError } from "@/lib/utils"
import { AppError } from "@/lib/errors"
import { alertCronFailure } from "@/lib/alerts"

// Sequential Midtrans status checks for all pending/overdue invoices with links
export const maxDuration = 120

async function handleReconcilePayments(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return apiError("UNAUTHORIZED", "Unauthorized", 401)
  }

  if (!(await isCronJobEnabled("reconcile_payments"))) {
    return apiSuccess({ skipped: true, reason: "cron_disabled" })
  }

  try {
    const result = await paymentService.reconcileUnpaidInvoices({ minAgeHours: 6 })
    return apiSuccess(result)
  } catch (err) {
    await alertCronFailure("reconcile-payments", err)
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}

export async function GET(request: NextRequest) {
  return handleReconcilePayments(request)
}

export async function POST(request: NextRequest) {
  return handleReconcilePayments(request)
}
