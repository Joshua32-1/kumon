import { type NextRequest } from "next/server"
import { z } from "zod"
import { studentService } from "@/features/students/service"
import { verifyCronAuth } from "@/lib/auth/cron"
import { isCronJobEnabled } from "@/lib/cron/enabled"
import { isGradePromotionMonth } from "@/lib/billing/grades"
import { apiSuccess, apiError, currentMonthYearInCenterTimezone } from "@/lib/utils"
import { AppError, Errors } from "@/lib/errors"

const bodySchema = z
  .object({
    force: z.boolean().optional(),
    promotionYear: z.number().int().min(2020).optional(),
  })
  .optional()

async function handlePromoteGrades(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return apiError("UNAUTHORIZED", "Unauthorized", 401)
  }

  if (!(await isCronJobEnabled("promote_grades"))) {
    return apiSuccess({ skipped: true, reason: "cron_disabled" })
  }

  try {
    let body: z.infer<typeof bodySchema> = undefined
    if (request.method === "POST") {
      try {
        const raw = await request.json()
        const parsed = bodySchema.safeParse(raw)
        if (parsed.success) body = parsed.data
      } catch {
        // Empty body is fine — defaults to July cron behavior
      }
    }

    const { month, year } = currentMonthYearInCenterTimezone()

    if (!isGradePromotionMonth(month) && !body?.force) {
      throw Errors.OUTSIDE_PROMOTION_WINDOW()
    }

    let promotionYear = body?.promotionYear
    if (promotionYear == null) {
      if (!isGradePromotionMonth(month)) {
        throw Errors.BAD_REQUEST("promotionYear is required when running outside July with force")
      }
      promotionYear = year
    }

    const result = await studentService.promoteGradesAnnual(promotionYear)
    return apiSuccess(result)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}

export async function GET(request: NextRequest) {
  return handlePromoteGrades(request)
}

export async function POST(request: NextRequest) {
  return handlePromoteGrades(request)
}
