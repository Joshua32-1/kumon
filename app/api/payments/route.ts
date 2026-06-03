import { type NextRequest } from "next/server"
import { paymentService } from "@/features/payments/service"
import { apiSuccess, apiError } from "@/lib/utils"
import { AppError } from "@/lib/errors"
import type { PaymentStatus } from "@/features/payments/types"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const status = searchParams.get("status") as PaymentStatus | null
    const month = searchParams.get("month")
    const year = searchParams.get("year")
    const student_id = searchParams.get("student_id")

    const invoices = await paymentService.list({
      status: status ?? undefined,
      month: month ? Number(month) : undefined,
      year: year ? Number(year) : undefined,
      student_id: student_id ?? undefined,
    })
    return apiSuccess(invoices)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
