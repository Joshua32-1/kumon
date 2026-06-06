import { type NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  isRevenueChartPeriod,
  summarizeRevenueChart,
  type RevenueChartPeriod,
} from "@/lib/billing/revenue-chart"
import { apiSuccess, apiError } from "@/lib/utils"

export async function GET(request: NextRequest) {
  try {
    const periodParam = request.nextUrl.searchParams.get("period") ?? "1_year"
    if (!isRevenueChartPeriod(periodParam)) {
      return apiError("VALIDATION_ERROR", "Periode tidak valid", 422)
    }

    const period = periodParam as RevenueChartPeriod
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from("invoices")
      .select("month, year, amount")
      .eq("status", "PAID")
      .returns<{ month: number; year: number; amount: number }[]>()

    if (error) throw error

    return apiSuccess(summarizeRevenueChart(data ?? [], period))
  } catch {
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
