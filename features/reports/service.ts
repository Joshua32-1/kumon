import { createSupabaseServerClient } from "@/lib/supabase/server"
import { todayInCenterTimezone } from "@/lib/utils"
import type { RevenueChartPeriod } from "@/lib/billing/revenue-chart"
import {
  summarizeCollectionRate,
  type CollectionInvoiceRow,
  type CollectionRateData,
} from "@/lib/reports/collection-rate"
import {
  buildArrearsAging,
  type ArrearsAgingRow,
  type ArrearsAgingSummary,
} from "@/lib/reports/arrears-aging"

// Read-only reporting reads. Uses the cookie-session server client (dashboard
// context, RLS-scoped) and delegates all math to the pure helpers in lib/reports.
export const reportsService = {
  async collectionRate(period: RevenueChartPeriod): Promise<CollectionRateData> {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from("invoices")
      .select("month, year, amount, status")
      .returns<CollectionInvoiceRow[]>()
    if (error) throw error
    return summarizeCollectionRate(data ?? [], period)
  },

  async arrearsAging(): Promise<ArrearsAgingSummary> {
    const supabase = await createSupabaseServerClient()
    const today = todayInCenterTimezone()
    const { data, error } = await supabase
      .from("invoices")
      .select("status, due_date, amount")
      .in("status", ["PENDING", "OVERDUE"])
      .returns<ArrearsAgingRow[]>()
    if (error) throw error
    return buildArrearsAging(data ?? [], today)
  },
}
