import { formatRupiah, getMonthName } from "@/lib/utils"
import {
  formatPaymentDetailsForWhatsApp,
  formatStudentEnrollmentForWhatsApp,
  type InvoiceLineItem,
  type SchoolLevel,
} from "@/lib/billing/fees"
import type { MessagingProvider, MessageResult } from "./types"
import type { Invoice } from "@/features/payments/types"
import type { Contact } from "@/features/students/types"

type LineItemInput = Pick<InvoiceLineItem, "label" | "unit_amount">

export interface PaymentWhatsAppContext {
  studentName: string
  schoolLevel: SchoolLevel
}

function normalizeLineItems(
  items: Array<Partial<LineItemInput> & { label?: string; unit_amount?: number }>
): LineItemInput[] {
  return items
    .filter((i) => i.label != null && i.unit_amount != null)
    .map((i) => ({ label: i.label!, unit_amount: i.unit_amount! }))
}

function subjectLabelsFromLineItems(lineItems: LineItemInput[]): string[] {
  return lineItems.map((l) => l.label)
}

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

// ── Message templates ──────────────────────────────────────────────────────

export function buildPaymentReminderMessage(params: {
  contactName: string
  studentName: string
  schoolLevel: SchoolLevel
  invoice: Invoice
  reminderNumber: number
  paymentUrl: string
  lineItems: Array<Partial<LineItemInput>>
}): string {
  const { contactName, studentName, schoolLevel, invoice, reminderNumber, paymentUrl, lineItems } =
    params
  const normalized = normalizeLineItems(lineItems)
  const monthName = getMonthName(invoice.month)
  const total = formatRupiah(invoice.amount)
  const ordinal = ["pertama", "kedua", "ketiga"][reminderNumber - 1] ?? `ke-${reminderNumber}`

  const enrollment = formatStudentEnrollmentForWhatsApp(
    studentName,
    schoolLevel,
    subjectLabelsFromLineItems(normalized)
  )
  const details = formatPaymentDetailsForWhatsApp(
    monthName,
    invoice.year,
    normalized,
    total,
    "belum kami terima"
  )

  return (
    `Halo Bapak/Ibu ${contactName},\n\n` +
    `Ini adalah pengingat ${ordinal} pembayaran untuk siswa ${studentName}:\n\n` +
    `${enrollment}\n\n` +
    `${details}\n\n` +
    `Silakan bayar melalui link berikut:\n${paymentUrl}\n\n` +
    `Terima kasih 🙏`
  )
}

export function buildPaymentConfirmationMessage(params: {
  contactName: string
  studentName: string
  schoolLevel: SchoolLevel
  invoice: Invoice
  lineItems: Array<Partial<LineItemInput>>
}): string {
  const { contactName, studentName, schoolLevel, invoice, lineItems } = params
  const normalized = normalizeLineItems(lineItems)
  const monthName = getMonthName(invoice.month)
  const total = formatRupiah(invoice.amount)

  const enrollment = formatStudentEnrollmentForWhatsApp(
    studentName,
    schoolLevel,
    subjectLabelsFromLineItems(normalized)
  )
  const details = formatPaymentDetailsForWhatsApp(
    monthName,
    invoice.year,
    normalized,
    total,
    "telah kami terima"
  )

  return (
    `Halo Bapak/Ibu ${contactName},\n\n` +
    `Pembayaran untuk siswa ${studentName}:\n\n` +
    `${enrollment}\n\n` +
    `${details}\n\n` +
    `Terima kasih 🙏`
  )
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
    paymentUrl: string,
    lineItems: Array<Partial<LineItemInput>> = [],
    context: PaymentWhatsAppContext
  ): Promise<MessageResult> {
    const message = buildPaymentReminderMessage({
      contactName: contact.full_name,
      studentName: context.studentName,
      schoolLevel: context.schoolLevel,
      invoice,
      reminderNumber,
      paymentUrl,
      lineItems,
    })
    return this.send(contact.whatsapp_number, message)
  },

  async sendPaymentConfirmation(
    invoice: Invoice,
    contact: Contact,
    lineItems: Array<Partial<LineItemInput>> = [],
    context: PaymentWhatsAppContext
  ): Promise<MessageResult> {
    const message = buildPaymentConfirmationMessage({
      contactName: contact.full_name,
      studentName: context.studentName,
      schoolLevel: context.schoolLevel,
      invoice,
      lineItems,
    })
    return this.send(contact.whatsapp_number, message)
  },
}
