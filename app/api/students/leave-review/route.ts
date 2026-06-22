import { studentService } from "@/features/students/service"
import { apiSuccess, apiError } from "@/lib/utils"
import { AppError } from "@/lib/errors"
import { requireUser } from "@/lib/auth/user"

export async function GET() {
  const denied = await requireUser()
  if (denied) return denied
  try {
    const result = await studentService.listLeaveReviewAlerts()
    return apiSuccess(result)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
