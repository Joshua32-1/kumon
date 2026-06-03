import { formatRupiah, getMonthName } from "@/lib/utils"
import type { MessagingProvider, MessageResult } from "./types"
import type { Invoice } from "@/features/payments/types"
import type { Contact } from "@/features/students/types"

// ── Providers ─────────────────────────────────────────────────────────────

class FonnteProvider implements MessagingProvider {
  async send(to: string, message: string): Promise<MessageResult> {
    const apiUrl = process.env.WHATSAPP_API_URL
    const apiKey = process.env.WHATSAPP_API_KEY

    if (!apiUrl || !apiKey) {
      console.warn("WhatsApp env vars not set — message not sent")
      return { success: false, provider: "fonnte", error: "Not configured" }
    }

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ target: to, message }),
      })
      const data = await res.json()
      return {
        success: data.status === true,
        provider: "fonnte",
        message_id: data.id,
        error: data.reason,
      }
    } catch (err) {
      return { success: false, provider: "fonnte", error: String(err) }
    }
  }
}

function getProvider(): MessagingProvider {
  const provider = process.env.WHATSAPP_PROVIDER ?? "fonnte"
  if (provider === "fonnte") return new FonnteProvider()
  throw new Error(`Unknown WhatsApp provider: ${provider}`)
}

// ── Service ────────────────────────────────────────────────────────────────

export const messagingService = {
  async send(to: string, message: string): Promise<MessageResult> {
    return getProvider().send(to, message)
  },

  async sendPaymentReminder(
    invoice: Invoice,
    contact: Contact,
    reminderNumber: number,
    paymentUrl: string
  ): Promise<MessageResult> {
    const monthName = getMonthName(invoice.month)
    const amount = formatRupiah(invoice.amount)
    const ordinal = ["pertama", "kedua", "ketiga"][reminderNumber - 1] ?? `ke-${reminderNumber}`
    const dueDate = new Date(invoice.due_date).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    const message =
      `Halo Bapak/Ibu ${contact.full_name},\n\n` +
      `Ini adalah pengingat ${ordinal} pembayaran SPP Kumon bulan ${monthName} ${invoice.year} ` +
      `sebesar *${amount}* yang belum kami terima.\n` +
      `Jatuh tempo: ${dueDate}.\n\n` +
      `Silakan bayar melalui link berikut:\n${paymentUrl}\n\n` +
      `Terima kasih 🙏`
    return this.send(contact.whatsapp_number, message)
  },

  async sendPaymentConfirmation(
    invoice: Invoice,
    contact: Contact
  ): Promise<MessageResult> {
    const monthName = getMonthName(invoice.month)
    const amount = formatRupiah(invoice.amount)
    const message =
      `Halo Bapak/Ibu ${contact.full_name},\n\n` +
      `Pembayaran SPP Kumon bulan ${monthName} ${invoice.year} ` +
      `sebesar *${amount}* telah kami terima. Terima kasih 🙏`
    return this.send(contact.whatsapp_number, message)
  },
}
