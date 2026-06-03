import { type NextRequest } from "next/server"

/** Validates cron/automation requests via x-api-key or Vercel Cron bearer token. */
export function verifyCronAuth(request: NextRequest): boolean {
  const apiKey = request.headers.get("x-api-key")
  if (apiKey && apiKey === process.env.WEBHOOK_SECRET) return true

  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true

  return false
}
