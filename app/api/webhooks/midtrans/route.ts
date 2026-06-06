import { type NextRequest } from "next/server"
import { paymentService } from "@/features/payments/service"
import { verifyMidtransSignature } from "@/lib/midtrans/client"
import { apiSuccess, apiError } from "@/lib/utils"
import { AppError } from "@/lib/errors"
import type { MidtransWebhookPayload } from "@/features/payments/types"

export async function POST(request: NextRequest) {
  let body: MidtransWebhookPayload
  try {
    body = await request.json()
  } catch {
    return apiError("BAD_REQUEST", "Invalid JSON", 400)
  }

  const serverKey = process.env.MIDTRANS_SERVER_KEY ?? ""
  const isValid = verifyMidtransSignature(
    body.order_id,
    body.status_code,
    body.gross_amount,
    serverKey,
    body.signature_key
  )

  if (!isValid) {
    return apiError("WEBHOOK_INVALID", "Invalid signature", 401)
  }

  try {
    const webhookResult = await paymentService.handleMidtransWebhook(body)

    if (webhookResult.sendConfirmation && webhookResult.invoiceId) {
      try {
        await paymentService.sendPaymentConfirmationForInvoice(webhookResult.invoiceId)
      } catch (err) {
        console.error("Failed to send payment confirmation:", err)
      }
    }

    return apiSuccess({ received: true, ...webhookResult })
  } catch (err) {
    if (err instanceof AppError) {
      return apiError(err.code, err.message, err.statusCode)
    }
    console.error("Midtrans webhook handler failed:", err)
    return apiError("INTERNAL_ERROR", "Internal server error", 500)
  }
}
