import { formatRupiah, getMonthName } from "@/lib/utils"
import {
  formatPaymentDetailsForWhatsApp,
  formatStudentEnrollmentForWhatsApp,
  type InvoiceLineItem,
  type SchoolLevel,
} from "@/lib/billing/fees"
import type { MessagingProvider, MessageResult, TemplateComponent } from "./types"
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

class MetaCloudProvider implements MessagingProvider {
  private get accessToken(): string | undefined {
    return process.env.META_ACCESS_TOKEN
  }
  private get phoneNumberId(): string | undefined {
    return process.env.META_PHONE_NUMBER_ID
  }
  private get apiVersion(): string {
    return process.env.META_API_VERSION ?? "v21.0"
  }
  private get apiUrl(): string {
    return `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`
  }

  private normalizePhone(to: string): string {
    return to.startsWith("+") ? to.slice(1) : to
  }

  async send(to: string, message: string): Promise<MessageResult> {
    if (!this.accessToken || !this.phoneNumberId) {
      console.warn("Meta Cloud API env vars not set — message not sent")
      return { success: false, provider: "meta", error: "Not configured" }
    }
    try {
      const res = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: this.normalizePhone(to),
          type: "text",
          text: { body: message },
        }),
      })
      const data = await res.json()
      if (res.ok && data.messages?.[0]?.id) {
        return { success: true, provider: "meta", message_id: data.messages[0].id }
      }
      return { success: false, provider: "meta", error: data.error?.message ?? "Unknown error" }
    } catch (err) {
      return { success: false, provider: "meta", error: String(err) }
    }
  }

  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components: TemplateComponent[]
  ): Promise<MessageResult> {
    if (!this.accessToken || !this.phoneNumberId) {
      console.warn("Meta Cloud API env vars not set — message not sent")
      return { success: false, provider: "meta", error: "Not configured" }
    }
    try {
      const res = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: this.normalizePhone(to),
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            components,
          },
        }),
      })
      const data = await res.json()
      if (res.ok && data.messages?.[0]?.id) {
        return { success: true, provider: "meta", message_id: data.messages[0].id }
      }
      const details = data.error?.error_data?.details as string | undefined
      const base = data.error?.message ?? "Unknown error"
      const hint =
        data.error?.code === 132001
          ? ` (template: ${templateName}, language: ${languageCode})`
          : ""
      return {
        success: false,
        provider: "meta",
        error: details ? `${base} — ${details}${hint}` : `${base}${hint}`,
      }
    } catch (err) {
      return { success: false, provider: "meta", error: String(err) }
    }
  }
}

function getProvider(): MessagingProvider {
  return new MetaCloudProvider()
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
  /** Fixed word for the {{pengingat_ke}} slot (e.g. "pembaruan" on recalc). */
  ordinalOverride?: string
}): string {
  const {
    contactName,
    studentName,
    schoolLevel,
    invoice,
    reminderNumber,
    paymentUrl,
    lineItems,
    ordinalOverride,
  } = params
  const normalized = normalizeLineItems(lineItems)
  const monthName = getMonthName(invoice.month)
  const total = formatRupiah(invoice.amount)
  const ordinal = ordinalOverride ?? (["pertama", "kedua", "ketiga"][reminderNumber - 1] ?? `ke-${reminderNumber}`)

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
    context: PaymentWhatsAppContext,
    ordinalOverride?: string
  ): Promise<MessageResult> {
    const provider = getProvider()
    const templateName = process.env.META_TEMPLATE_REMINDER_NAME
    const languageCode = process.env.META_TEMPLATE_REMINDER_LANGUAGE ?? "id"

    if (templateName && provider.sendTemplate) {
      const normalized = normalizeLineItems(lineItems)
      const ordinal = ordinalOverride ?? (["pertama", "kedua", "ketiga"][reminderNumber - 1] ?? `ke-${reminderNumber}`)
      const subjects = subjectLabelsFromLineItems(normalized)
      const subjectsText = subjects.length > 0 ? subjects.join(", ") : "—"
      // Named template body params (Meta parameter_format: named)
      const components: TemplateComponent[] = [
        {
          type: "body",
          parameters: [
            { type: "text", parameter_name: "nama_orang_tua", text: contact.full_name },
            { type: "text", parameter_name: "nama_siswa", text: context.studentName },
            { type: "text", parameter_name: "pengingat_ke", text: ordinal },
            {
              type: "text",
              parameter_name: "bulan_tagihan",
              text: `${getMonthName(invoice.month)} ${invoice.year}`,
            },
            { type: "text", parameter_name: "total_tagihan", text: formatRupiah(invoice.amount) },
            { type: "text", parameter_name: "link_pembayaran", text: paymentUrl },
            { type: "text", parameter_name: "mata_pelajaran", text: subjectsText },
          ],
        },
      ]
      return provider.sendTemplate(contact.whatsapp_number, templateName, languageCode, components)
    }

    const message = buildPaymentReminderMessage({
      contactName: contact.full_name,
      studentName: context.studentName,
      schoolLevel: context.schoolLevel,
      invoice,
      reminderNumber,
      paymentUrl,
      lineItems,
      ordinalOverride,
    })
    return this.send(contact.whatsapp_number, message)
  },

  async sendPaymentConfirmation(
    invoice: Invoice,
    contact: Contact,
    lineItems: Array<Partial<LineItemInput>> = [],
    context: PaymentWhatsAppContext
  ): Promise<MessageResult> {
    const provider = getProvider()
    const templateName = process.env.META_TEMPLATE_CONFIRMATION_NAME
    const languageCode = process.env.META_TEMPLATE_CONFIRMATION_LANGUAGE ?? "id"

    if (templateName && provider.sendTemplate) {
      const normalized = normalizeLineItems(lineItems)
      const subjects = subjectLabelsFromLineItems(normalized)
      const subjectsText = subjects.length > 0 ? subjects.join(", ") : "—"
      // Named template body params (Meta parameter_format: named)
      const components: TemplateComponent[] = [
        {
          type: "body",
          parameters: [
            { type: "text", parameter_name: "nama_orang_tua", text: contact.full_name },
            { type: "text", parameter_name: "nama_siswa", text: context.studentName },
            {
              type: "text",
              parameter_name: "bulan_tagihan",
              text: `${getMonthName(invoice.month)} ${invoice.year}`,
            },
            { type: "text", parameter_name: "total_tagihan", text: formatRupiah(invoice.amount) },
            { type: "text", parameter_name: "mata_pelajaran", text: subjectsText },
          ],
        },
      ]
      return provider.sendTemplate(contact.whatsapp_number, templateName, languageCode, components)
    }

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
