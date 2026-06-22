import { type NextRequest } from "next/server"
import { reportsService } from "@/features/reports/service"
import { parseLedgerParams } from "@/lib/reports/ledger-query"
import { apiSuccess, apiError } from "@/lib/utils"
import { requireUser } from "@/lib/auth/user"

export async function GET(request: NextRequest) {
  const denied = await requireUser()
  if (denied) return denied
  try {
    const parsed = parseLedgerParams(request.nextUrl.searchParams)
    if (!parsed.ok) return apiError("VALIDATION_ERROR", parsed.message, 422)
    const data = await reportsService.paymentLedger(parsed.params)
    return apiSuccess(data)
  } catch {
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
