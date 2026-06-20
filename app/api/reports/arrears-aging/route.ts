import { reportsService } from "@/features/reports/service"
import { apiSuccess, apiError } from "@/lib/utils"

export async function GET() {
  try {
    const data = await reportsService.arrearsAging()
    return apiSuccess(data)
  } catch {
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
