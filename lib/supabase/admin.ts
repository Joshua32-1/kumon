import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

// Service role — use only server-side (webhooks, automation). Never expose to client.
// Lazily initialized to avoid module-level errors when env vars are not set (e.g. during CI builds).
let _admin: ReturnType<typeof createClient<Database>> | null = null

export function getSupabaseAdmin() {
  if (!_admin) {
    _admin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return _admin
}

// Keep named export for compatibility with existing imports
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get(_target, prop) {
    return getSupabaseAdmin()[prop as keyof ReturnType<typeof createClient<Database>>]
  },
})
