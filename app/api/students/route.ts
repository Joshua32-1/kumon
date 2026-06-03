import { type NextRequest } from "next/server"
import { studentService } from "@/features/students/service"
import { createStudentSchema } from "@/features/students/validations"
import { apiSuccess, apiError } from "@/lib/utils"
import { AppError } from "@/lib/errors"
import type { StudentStatus } from "@/features/students/types"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const status = searchParams.get("status") as StudentStatus | null
    const search = searchParams.get("search") ?? undefined

    const students = await studentService.list({ status: status ?? undefined, search })
    return apiSuccess(students)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createStudentSchema.safeParse(body)
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", JSON.stringify(parsed.error.flatten()), 422)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const student = await studentService.create(parsed.data as any)
    return apiSuccess(student, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
