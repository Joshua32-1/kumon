import { type NextRequest } from "next/server"
import { z } from "zod"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { persistFeeScheduleOnSettingsSave } from "@/lib/billing/load-subject-fees"
import { apiSuccess, apiError } from "@/lib/utils"
import { requireUser } from "@/lib/auth/user"

// The only config keys the settings endpoint may write. Whitelisting prevents a
// typo'd key from creating junk system_config rows or clobbering unrelated config.
// Must include every key the Settings UI submits (see SettingsForm.handleSave) plus
// the server-managed fee-schedule history, or a legitimate save 422s.
export const SYSTEM_CONFIG_KEYS = [
  "center_name",
  "cron_jobs",
  "reminder_days",
  "subject_fees",
  "subject_fees_schedule",
  "max_leave_months",
] as const

const updateSchema = z.object({
  updates: z.array(
    z.object({
      key: z.enum(SYSTEM_CONFIG_KEYS),
      value: z.record(z.string(), z.unknown()),
    })
  ),
})

export { updateSchema as settingsUpdateSchema }

export async function GET() {
  const denied = await requireUser()
  if (denied) return denied
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.from("system_config").select("*")
    if (error) throw error
    return apiSuccess(data)
  } catch {
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}

export async function PATCH(request: NextRequest) {
  const denied = await requireUser()
  if (denied) return denied
  try {
    const body = await request.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", JSON.stringify(parsed.error.flatten()), 422)
    }

    const supabase = await createSupabaseServerClient()
    for (const { key, value } of parsed.data.updates) {
      await supabase
        .from("system_config")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ key, value, updated_at: new Date().toISOString() } as any)

      if (key === "subject_fees") {
        await persistFeeScheduleOnSettingsSave(
          supabase,
          value as Record<string, unknown>
        )
      }
    }

    return apiSuccess({ updated: parsed.data.updates.length })
  } catch {
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
