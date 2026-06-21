import { type NextRequest } from "next/server"
import { reportsService } from "@/features/reports/service"
import { parseLedgerParams } from "@/lib/reports/ledger-query"
import { buildPaymentLedgerCsv } from "@/lib/reports/csv"
import { apiError } from "@/lib/utils"

export async function GET(request: NextRequest) {
  try {
    const parsed = parseLedgerParams(request.nextUrl.searchParams)
    if (!parsed.ok) return apiError("VALIDATION_ERROR", parsed.message, 422)

    const rows = await reportsService.paymentLedger(parsed.params)
    const csv = buildPaymentLedgerCsv(rows)
    const suffix = parsed.params.status ? `-${parsed.params.status.toLowerCase()}` : ""

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pembayaran-${parsed.params.year}${suffix}.csv"`,
      },
    })
  } catch {
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
