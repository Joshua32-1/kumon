import { type NextRequest } from "next/server"
import { z } from "zod"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { apiSuccess, apiError } from "@/lib/utils"

const updateSchema = z.object({
  updates: z.array(
    z.object({
      key: z.string(),
      value: z.record(z.string(), z.unknown()),
    })
  ),
})

export async function GET() {
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
    }

    return apiSuccess({ updated: parsed.data.updates.length })
  } catch {
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
