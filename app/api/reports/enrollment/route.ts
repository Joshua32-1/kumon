import { type NextRequest } from "next/server"
import { isRevenueChartPeriod, type RevenueChartPeriod } from "@/lib/billing/revenue-chart"
import { reportsService } from "@/features/reports/service"
import { apiSuccess, apiError } from "@/lib/utils"
import { requireUser } from "@/lib/auth/user"

export async function GET(request: NextRequest) {
  const denied = await requireUser()
  if (denied) return denied
  try {
    const periodParam = request.nextUrl.searchParams.get("period") ?? "1_year"
    if (!isRevenueChartPeriod(periodParam)) {
      return apiError("VALIDATION_ERROR", "Periode tidak valid", 422)
    }
    const data = await reportsService.enrollmentChurn(periodParam as RevenueChartPeriod)
    return apiSuccess(data)
  } catch {
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
