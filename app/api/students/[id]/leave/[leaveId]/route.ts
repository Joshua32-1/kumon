import { type NextRequest } from "next/server"
import { studentService } from "@/features/students/service"
import { apiSuccess, apiError } from "@/lib/utils"
import { AppError } from "@/lib/errors"

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; leaveId: string }> }
) {
  try {
    const { leaveId } = await params
    await studentService.cancelLeave(leaveId)
    return apiSuccess({ leaveId })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
