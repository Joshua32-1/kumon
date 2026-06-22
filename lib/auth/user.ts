import { createSupabaseServerClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/utils"
import { Errors } from "@/lib/errors"
import type { NextResponse } from "next/server"

/**
 * Defense-in-depth in-handler auth guard for user/session API routes.
 *
 * Middleware (proxy.ts) already redirects unauthenticated browser requests to
 * /login, and RLS scopes every table to `authenticated`. This guard ensures a
 * route still fail-closes with a clean 401 if the middleware matcher/exemption
 * ever drifts. RLS is `FOR ALL TO authenticated USING(true)`, so a present user
 * IS the admin — no role check is needed.
 *
 * Returns the 401 NextResponse when unauthenticated (early-return it), else null.
 * Mirrors the verifyCronAuth early-return idiom in lib/auth/cron.ts.
 *
 *   const denied = await requireUser()
 *   if (denied) return denied
 *
 * Do NOT use on webhooks, crons, or /pay/[token] — those authenticate themselves.
 */
export async function requireUser(): Promise<NextResponse | null> {
  const supabase = await createSupabaseServerClient()
  // getUser() surfaces auth failures (expired/invalid JWT, network) as user: null,
  // so the !user check alone covers them — do not add error handling that would
  // change the 401 contract.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    const e = Errors.UNAUTHORIZED()
    return apiError(e.code, e.message, e.statusCode)
  }
  return null
}
