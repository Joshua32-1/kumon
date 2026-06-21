import { type NextRequest } from "next/server"

const isProduction = process.env.NODE_ENV === "production"

function cronSecretConfigured(): boolean {
  return Boolean(process.env.CRON_SECRET?.trim())
}

/**
 * Constant-time string comparison. Mirrors the webhook verifiers
 * ([lib/midtrans/client.ts], [lib/messaging/delivery.ts]): compare on byte length,
 * since timingSafeEqual throws on length mismatch, and a length mismatch is itself a
 * fail. Returns false for null/undefined so callers stay fail-closed.
 */
function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto")
  const aBuf = Buffer.from(a, "utf8")
  const bBuf = Buffer.from(b, "utf8")
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

if (isProduction && !cronSecretConfigured()) {
  console.error(
    "[cron] CRON_SECRET is not set. Vercel Cron jobs will return 401 until it is configured."
  )
}

/** Validates cron/automation requests via x-api-key or Vercel Cron bearer token. */
export function verifyCronAuth(request: NextRequest): boolean {
  const apiKey = request.headers.get("x-api-key")
  if (apiKey && safeEqual(apiKey, process.env.WEBHOOK_SECRET)) return true

  const authHeader = request.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    if (!cronSecretConfigured()) {
      if (isProduction) {
        console.error("[cron] Rejected bearer auth: CRON_SECRET is not configured")
      }
      return false
    }
    if (safeEqual(authHeader, `Bearer ${process.env.CRON_SECRET}`)) return true
  }

  return false
}
