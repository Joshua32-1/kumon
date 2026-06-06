import { type NextRequest } from "next/server"

const isProduction = process.env.NODE_ENV === "production"

function cronSecretConfigured(): boolean {
  return Boolean(process.env.CRON_SECRET?.trim())
}

if (isProduction && !cronSecretConfigured()) {
  console.error(
    "[cron] CRON_SECRET is not set. Vercel Cron jobs will return 401 until it is configured."
  )
}

/** Validates cron/automation requests via x-api-key or Vercel Cron bearer token. */
export function verifyCronAuth(request: NextRequest): boolean {
  const apiKey = request.headers.get("x-api-key")
  if (apiKey && apiKey === process.env.WEBHOOK_SECRET) return true

  const authHeader = request.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    if (!cronSecretConfigured()) {
      if (isProduction) {
        console.error("[cron] Rejected bearer auth: CRON_SECRET is not configured")
      }
      return false
    }
    if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true
  }

  return false
}
