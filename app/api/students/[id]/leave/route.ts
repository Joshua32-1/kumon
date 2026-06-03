import { type NextRequest } from "next/server"
import { studentService } from "@/features/students/service"
import { setLeaveSchema } from "@/features/students/validations"
import { apiSuccess, apiError } from "@/lib/utils"
import { AppError } from "@/lib/errors"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const parsed = setLeaveSchema.safeParse(body)
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", JSON.stringify(parsed.error.flatten()), 422)
    }

    const { month, year, reason } = parsed.data
    const leave = await studentService.setLeave(id, month, year, reason)
    return apiSuccess(leave, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
