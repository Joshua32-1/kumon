import { type NextRequest } from "next/server"
import { z } from "zod"
import { paymentService } from "@/features/payments/service"
import { verifyCronAuth } from "@/lib/auth/cron"
import { isCronJobEnabled } from "@/lib/cron/enabled"
import { apiSuccess, apiError, todayInCenterTimezone, dayOfMonthFromDateString } from "@/lib/utils"
import { AppError } from "@/lib/errors"
import { alertCronFailure } from "@/lib/alerts"
import {
  DEFAULT_REMINDER_DAYS,
  REMINDER_SLOT_COUNT,
  REMINDER_PHASE2_START_SLOT,
  REMINDER_SLOT_START_MINUTES_WIB,
  REMINDER_SLOT_INTERVAL_MIN,
  REMINDER_SLOT_INFER_OFFSET_MIN,
} from "@/lib/constants"

// Allow up to 5 minutes per slot (100 sends × 2s delay ≈ 3.3 min)
export const maxDuration = 300

const bodySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    slot: z.number().int().min(1).max(REMINDER_SLOT_COUNT).optional(),
  })
  .optional()

/**
 * Infer which slot this invocation represents based on the current WIB time.
 * Cron schedule (WIB): 09:00 slot1 · 09:30 slot2 · … · 13:30 slot10
 * UTC equivalents:     02:00      · 02:30       · … · 06:30
 */
function inferSlot(): number {
  const now = new Date()
  const wibHour = (now.getUTCHours() + 7) % 24
  const wibMinute = now.getUTCMinutes()
  const wibTime = wibHour * 60 + wibMinute

  for (let slot = 1; slot < REMINDER_SLOT_COUNT; slot++) {
    const boundary =
      REMINDER_SLOT_START_MINUTES_WIB +
      (slot - 1) * REMINDER_SLOT_INTERVAL_MIN +
      REMINDER_SLOT_INFER_OFFSET_MIN
    if (wibTime < boundary) return slot
  }
  return REMINDER_SLOT_COUNT
}

/** Slots 1–9: Phase 1 only. Slot 10: Phase 1 + Phase 2 (overdue chase). */
function slotOptions(slot: number): { includeOverdueChase: boolean } {
  return { includeOverdueChase: slot >= REMINDER_PHASE2_START_SLOT }
}

async function handleSendReminders(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return apiError("UNAUTHORIZED", "Unauthorized", 401)
  }

  if (!(await isCronJobEnabled("send_reminders"))) {
    return apiSuccess({ skipped: true, reason: "cron_disabled" })
  }

  try {
    let date: string | undefined
    let slot: number | undefined

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

    const effectiveDate = date ?? todayInCenterTimezone()
    const dayOfMonth = dayOfMonthFromDateString(effectiveDate)
    const isReminderDay = DEFAULT_REMINDER_DAYS.includes(dayOfMonth)

    const effectiveSlot =
      slot ?? (isReminderDay ? inferSlot() : REMINDER_SLOT_COUNT)

    const result = await paymentService.processDueReminders(date, {
      slot: effectiveSlot,
      ...slotOptions(effectiveSlot),
    })

    return apiSuccess(result)
  } catch (err) {
    await alertCronFailure("send-reminders", err)
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
