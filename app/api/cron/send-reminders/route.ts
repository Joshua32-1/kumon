import { type NextRequest } from "next/server"
import { z } from "zod"
import { paymentService } from "@/features/payments/service"
import { verifyCronAuth } from "@/lib/auth/cron"
import { apiSuccess, apiError, todayInCenterTimezone, dayOfMonthFromDateString } from "@/lib/utils"
import { AppError } from "@/lib/errors"
import { DEFAULT_REMINDER_DAYS } from "@/lib/constants"

// Allow up to 5 minutes per slot (100 sends × 2s delay ≈ 3.3 min)
export const maxDuration = 300

const bodySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    slot: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  })
  .optional()

/**
 * Infer which slot this invocation represents based on the current WIB time.
 * Cron schedule (WIB): 09:00 slot1 · 09:30 slot2 · 10:00 slot3 · 10:30 slot4
 * UTC equivalents:     02:00      · 02:30       · 03:00       · 03:30
 */
function inferSlot(): 1 | 2 | 3 | 4 {
  const now = new Date()
  // Offset to WIB (UTC+7)
  const wibHour = (now.getUTCHours() + 7) % 24
  const wibMinute = now.getUTCMinutes()
  const wibTime = wibHour * 60 + wibMinute

  if (wibTime < 9 * 60 + 15) return 1       // before 09:15 → slot 1
  if (wibTime < 9 * 60 + 45) return 2        // 09:15–09:45 → slot 2
  if (wibTime < 10 * 60 + 15) return 3       // 09:45–10:15 → slot 3
  return 4                                    // 10:15+ → slot 4
}

/** Slots 1–2: Phase 1 only. Slots 3–4: Phase 1 + Phase 2 (overdue chase). */
function slotOptions(slot: 1 | 2 | 3 | 4): { includeOverdueChase: boolean } {
  return { includeOverdueChase: slot >= 3 }
}

async function handleSendReminders(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return apiError("UNAUTHORIZED", "Unauthorized", 401)
  }

  try {
    let date: string | undefined
    let slot: 1 | 2 | 3 | 4 | undefined

    if (request.method === "POST") {
      try {
        const raw = await request.json()
        const parsed = bodySchema.safeParse(raw)
        if (parsed.success) {
          date = parsed.data?.date
          slot = parsed.data?.slot
        }
      } catch {
        // Empty body — use today's date in WIB
      }
    }

    // On non-reminder days, Phase 2 never runs regardless of slot,
    // but still allow a manual run with slot override for testing.
    const effectiveDate = date ?? todayInCenterTimezone()
    const dayOfMonth = dayOfMonthFromDateString(effectiveDate)
    const isReminderDay = DEFAULT_REMINDER_DAYS.includes(dayOfMonth)

    // If no slot provided in body, infer from current time (on reminder days)
    // or default to slot 4 behavior (for manual/testing runs on non-reminder days)
    const effectiveSlot: 1 | 2 | 3 | 4 = slot ?? (isReminderDay ? inferSlot() : 4)

    const result = await paymentService.processDueReminders(date, {
      slot: effectiveSlot,
      ...slotOptions(effectiveSlot),
    })

    return apiSuccess(result)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}

export async function GET(request: NextRequest) {
  return handleSendReminders(request)
}

export async function POST(request: NextRequest) {
  return handleSendReminders(request)
}
