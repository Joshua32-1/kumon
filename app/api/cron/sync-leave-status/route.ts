import { type NextRequest } from "next/server"
import { studentService } from "@/features/students/service"
import { verifyCronAuth } from "@/lib/auth/cron"
import { isCronJobEnabled } from "@/lib/cron/enabled"
import { apiSuccess, apiError } from "@/lib/utils"
import { AppError } from "@/lib/errors"
import { alertCronFailure } from "@/lib/alerts"

async function handleSyncLeaveStatus(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return apiError("UNAUTHORIZED", "Unauthorized", 401)
  }

  if (!(await isCronJobEnabled("sync_leave_status"))) {
    return apiSuccess({ skipped: true, reason: "cron_disabled" })
  }

  try {
    const result = await studentService.syncLeaveStatuses()
    return apiSuccess(result)
  } catch (err) {
    await alertCronFailure("sync-leave-status", err)
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}

export async function GET(request: NextRequest) {
  return handleSyncLeaveStatus(request)
}

export async function POST(request: NextRequest) {
  return handleSyncLeaveStatus(request)
}
