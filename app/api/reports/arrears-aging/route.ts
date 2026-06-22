import { reportsService } from "@/features/reports/service"
import { apiSuccess, apiError } from "@/lib/utils"
import { requireUser } from "@/lib/auth/user"

export async function GET() {
  const denied = await requireUser()
  if (denied) return denied
  try {
    const data = await reportsService.arrearsAging()
    return apiSuccess(data)
  } catch {
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
