import { type NextRequest, NextResponse } from "next/server"
import { paymentService } from "@/features/payments/service"
import { verifyMetaSignature, parseMetaStatusEvents } from "@/lib/messaging/delivery"
import { apiSuccess, apiError } from "@/lib/utils"
import { alertCronFailure } from "@/lib/alerts"

// Meta WhatsApp webhook.
// GET  — subscription handshake (echo hub.challenge when the verify token matches).
// POST — delivery-status callbacks (sent/delivered/read/failed) → message_events.
// proxy.ts exempts /api/webhooks from auth; POST is verified by X-Hub-Signature-256.

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const mode = params.get("hub.mode")
  const token = params.get("hub.verify_token")
  const challenge = params.get("hub.challenge")

  const verifyToken = process.env.META_VERIFY_TOKEN
  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    })
  }
  return new NextResponse("Forbidden", { status: 403 })
}

export async function POST(request: NextRequest) {
  // Raw body is required for the HMAC — read it before any JSON parsing.
  const rawBody = await request.text()
  const appSecret = process.env.META_APP_SECRET ?? ""
  const signature = request.headers.get("x-hub-signature-256")

  if (!verifyMetaSignature(rawBody, signature, appSecret)) {
    return apiError("WEBHOOK_INVALID", "Invalid signature", 401)
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return apiError("BAD_REQUEST", "Invalid JSON", 400)
  }

  const events = parseMetaStatusEvents(payload)
  let updated = 0
  try {
    for (const event of events) {
      if (await paymentService.applyMessageDeliveryEvent(event)) updated++
    }
  } catch (err) {
    // Signature already verified — a throw here is a genuine processing failure.
    await alertCronFailure("webhook-meta", err)
    console.error("Meta webhook handler failed:", err)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }

  return apiSuccess({ received: true, events: events.length, updated })
}
