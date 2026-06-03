import { type NextRequest } from "next/server"
import { paymentService } from "@/features/payments/service"
import { messagingService } from "@/features/messaging/service"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { verifyMidtransSignature } from "@/lib/midtrans/client"
import { apiSuccess, apiError } from "@/lib/utils"
import type { MidtransWebhookPayload } from "@/features/payments/types"

export async function POST(request: NextRequest) {
  let body: MidtransWebhookPayload
  try {
    body = await request.json()
  } catch {
    return apiError("BAD_REQUEST", "Invalid JSON", 400)
  }

  // Verify Midtrans signature
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

  await paymentService.handleMidtransWebhook(body)

  // Send payment confirmation WhatsApp if paid
  const isSuccess =
    body.transaction_status === "settlement" || body.transaction_status === "capture"
  const isFraud = body.fraud_status === "deny"

  if (isSuccess && !isFraud) {
    try {
      const { data: invoice } = await supabaseAdmin
        .from("invoices")
        .select("*, students(full_name, contacts(whatsapp_number, is_primary, id, student_id, relationship, created_at, updated_at))")
        .eq("midtrans_order_id", body.order_id)
        .single()

      if (invoice) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoiceAny = invoice as any
        const contacts = invoiceAny.students?.contacts ?? []
        const primaryContact = contacts.find((c: { is_primary: boolean }) => c.is_primary) ?? contacts[0]

        if (primaryContact) {
          await messagingService.sendPaymentConfirmation(
            invoiceAny,
            primaryContact
          )
        }
      }
    } catch (err) {
      console.error("Failed to send payment confirmation:", err)
      // Don't fail the webhook — payment is already processed
    }
  }

  return apiSuccess({ received: true })
}
