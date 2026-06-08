import { randomBytes } from "crypto"

/** Base URL for parent-facing pay links (e.g. https://yourcenter.vercel.app). */
export function getAppOrigin(): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
  if (!origin) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured")
  }
  return origin
}

export function buildPaymentLink(token: string): string {
  return `${getAppOrigin()}/pay/${token}`
}

/** Client-safe payment URL when NEXT_PUBLIC_APP_URL is configured. */
export function buildPaymentLinkFromEnv(token: string): string | null {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
  if (!origin || !token) return null
  return `${origin}/pay/${token}`
}

/** URL-safe opaque token for /pay/{token} routes. */
export function generatePaymentAccessToken(): string {
  return randomBytes(16).toString("hex")
}
