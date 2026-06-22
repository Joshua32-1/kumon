import { type NextRequest } from "next/server"
import { studentService } from "@/features/students/service"
import { updateStudentSchema, updateEnrollmentSchema, updateContactSchema } from "@/features/students/validations"
import { apiSuccess, apiError } from "@/lib/utils"
import { AppError } from "@/lib/errors"
import { requireUser } from "@/lib/auth/user"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireUser()
  if (denied) return denied
  try {
    const { id } = await params
    const student = await studentService.getById(id)
    return apiSuccess(student)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireUser()
  if (denied) return denied
  try {
    const { id } = await params
    const body = await request.json()

    if ("subjects" in body) {
      const parsed = updateEnrollmentSchema.safeParse(body)
      if (!parsed.success) {
        return apiError("VALIDATION_ERROR", JSON.stringify(parsed.error.flatten()), 422)
      }
      await studentService.updateEnrollment(id, parsed.data)
      return apiSuccess({ updated: true })
    }

    if ("contact" in body) {
      const parsed = updateContactSchema.safeParse(body.contact)
      if (!parsed.success) {
        return apiError("VALIDATION_ERROR", JSON.stringify(parsed.error.flatten()), 422)
      }
      const contact = await studentService.updatePrimaryContact(id, parsed.data)
      return apiSuccess(contact)
    }

    const parsed = updateStudentSchema.safeParse(body)
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", JSON.stringify(parsed.error.flatten()), 422)
    }
    const student = await studentService.update(id, parsed.data)
    return apiSuccess(student)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireUser()
  if (denied) return denied
  try {
    const { id } = await params
    await studentService.deactivate(id)
    return apiSuccess({ id })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
