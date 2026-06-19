import type { SchoolLevel } from "@/lib/billing/fees"
import type { MessagingProvider, MessageResult, TemplateComponent } from "./types"
import type { Invoice } from "@/features/payments/types"
import type { Contact } from "@/features/students/types"
import {
  buildPaymentReminderMessage,
  buildPaymentConfirmationMessage,
  buildReminderTemplateComponents,
  buildConfirmationTemplateComponents,
  type LineItemInput,
} from "@/lib/messaging/templates"

// Re-exported for back-compat: features/payments/service.ts imports
// buildPaymentReminderMessage from this module.
export { buildPaymentReminderMessage, buildPaymentConfirmationMessage }

export interface PaymentWhatsAppContext {
  studentName: string
  schoolLevel: SchoolLevel
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

// ── Service ────────────────────────────────────────────────────────────────

export const messagingService = {
  async send(to: string, message: string): Promise<MessageResult> {
    return getProvider().send(to, message)
  },

  async sendPaymentReminder(
    invoice: Invoice,
    contact: Contact,
    paymentUrl: string,
    lineItems: Array<Partial<LineItemInput>> = [],
    context: PaymentWhatsAppContext
  ): Promise<MessageResult> {
    const provider = getProvider()
    const templateName = process.env.META_TEMPLATE_REMINDER_NAME
    const languageCode = process.env.META_TEMPLATE_REMINDER_LANGUAGE ?? "id"

    if (templateName && provider.sendTemplate) {
      // Named template body params (Meta parameter_format: named)
      const components = buildReminderTemplateComponents({
        contactName: contact.full_name,
        studentName: context.studentName,
        invoice,
        paymentUrl,
        lineItems,
      })
      return provider.sendTemplate(contact.whatsapp_number, templateName, languageCode, components)
    }

    const message = buildPaymentReminderMessage({
      contactName: contact.full_name,
      studentName: context.studentName,
      schoolLevel: context.schoolLevel,
      invoice,
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
    const provider = getProvider()
    const templateName = process.env.META_TEMPLATE_CONFIRMATION_NAME
    const languageCode = process.env.META_TEMPLATE_CONFIRMATION_LANGUAGE ?? "id"

    if (templateName && provider.sendTemplate) {
      // Named template body params (Meta parameter_format: named)
      const components = buildConfirmationTemplateComponents({
        contactName: contact.full_name,
        studentName: context.studentName,
        invoice,
        lineItems,
      })
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
