import { type NextRequest } from "next/server"
import { paymentService } from "@/features/payments/service"
import { verifyCronAuth } from "@/lib/auth/cron"
import { isCronJobEnabled } from "@/lib/cron/enabled"
import { apiSuccess, apiError, currentMonthYearInCenterTimezone } from "@/lib/utils"
import { AppError } from "@/lib/errors"
import { sendAdminAlert, formatMissingInvoicesAlert, alertCronFailure } from "@/lib/alerts"

// Daily invariant check (read-only): every billable student should have this month's
// invoice. The single-shot generate-invoices cron has no backup, so this is its
// safety net — emails the admin only when invoices are actually missing.
export const maxDuration = 60

async function handleBillingWatchdog(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return apiError("UNAUTHORIZED", "Unauthorized", 401)
  }

  if (!(await isCronJobEnabled("billing_watchdog"))) {
    return apiSuccess({ skipped: true, reason: "cron_disabled" })
  }

  try {
    const { month, year } = currentMonthYearInCenterTimezone()
    const result = await paymentService.runBillingWatchdog({ month, year })

    let alert_sent = false
    if (!result.healthy) {
      const { sent } = await sendAdminAlert(
        formatMissingInvoicesAlert({ month, year, missing: result.missing })
      )
      alert_sent = sent
    }

    return apiSuccess({
      ...result,
      missing_count: result.missing.length,
      alert_sent,
    })
  } catch (err) {
    await alertCronFailure("billing-watchdog", err)
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error("Billing watchdog failed:", err)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}

export async function GET(request: NextRequest) {
  return handleBillingWatchdog(request)
}

export async function POST(request: NextRequest) {
  return handleBillingWatchdog(request)
}
