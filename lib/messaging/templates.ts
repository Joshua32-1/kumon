import { formatRupiah, getMonthName } from "@/lib/utils"
import {
  formatPaymentDetailsForWhatsApp,
  formatStudentEnrollmentForWhatsApp,
  type InvoiceLineItem,
  type SchoolLevel,
} from "@/lib/billing/fees"
import type { Invoice } from "@/features/payments/types"
import type { TemplateComponent } from "@/features/messaging/types"

export type LineItemInput = Pick<InvoiceLineItem, "label" | "unit_amount">

export function normalizeLineItems(
  items: Array<Partial<LineItemInput> & { label?: string; unit_amount?: number }>
): LineItemInput[] {
  return items
    .filter((i) => i.label != null && i.unit_amount != null)
    .map((i) => ({ label: i.label!, unit_amount: i.unit_amount! }))
}

export function subjectLabelsFromLineItems(lineItems: LineItemInput[]): string[] {
  return lineItems.map((l) => l.label)
}

// ── Plain-text message bodies (fallback when no approved template is set) ───────

export function buildPaymentReminderMessage(params: {
  contactName: string
  studentName: string
  schoolLevel: SchoolLevel
  invoice: Invoice
  paymentUrl: string
  lineItems: Array<Partial<LineItemInput>>
}): string {
  const {
    contactName,
    studentName,
    schoolLevel,
    invoice,
    paymentUrl,
    lineItems,
  } = params
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
    "belum kami terima"
  )

  return (
    `Halo Bapak/Ibu ${contactName},\n\n` +
    `Ini adalah pengingat pembayaran untuk siswa ${studentName}:\n\n` +
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

// ── Meta named-template body components ─────────────────────────────────────────
// Parameter names must match the approved WhatsApp templates (see META_* vars in
// .env.local.example). Reminder carries `link_pembayaran`; confirmation does not.

function subjectsTextFromLineItems(lineItems: Array<Partial<LineItemInput>>): string {
  const subjects = subjectLabelsFromLineItems(normalizeLineItems(lineItems))
  return subjects.length > 0 ? subjects.join(", ") : "—"
}

export function buildReminderTemplateComponents(params: {
  contactName: string
  studentName: string
  invoice: Invoice
  paymentUrl: string
  lineItems: Array<Partial<LineItemInput>>
}): TemplateComponent[] {
  const { contactName, studentName, invoice, paymentUrl, lineItems } = params
  return [
    {
      type: "body",
      parameters: [
        { type: "text", parameter_name: "nama_orang_tua", text: contactName },
        { type: "text", parameter_name: "nama_siswa", text: studentName },
        {
          type: "text",
          parameter_name: "bulan_tagihan",
          text: `${getMonthName(invoice.month)} ${invoice.year}`,
        },
        { type: "text", parameter_name: "total_tagihan", text: formatRupiah(invoice.amount) },
        { type: "text", parameter_name: "link_pembayaran", text: paymentUrl },
        { type: "text", parameter_name: "mata_pelajaran", text: subjectsTextFromLineItems(lineItems) },
      ],
    },
  ]
}

export function buildConfirmationTemplateComponents(params: {
  contactName: string
  studentName: string
  invoice: Invoice
  lineItems: Array<Partial<LineItemInput>>
}): TemplateComponent[] {
  const { contactName, studentName, invoice, lineItems } = params
  return [
    {
      type: "body",
      parameters: [
        { type: "text", parameter_name: "nama_orang_tua", text: contactName },
        { type: "text", parameter_name: "nama_siswa", text: studentName },
        {
          type: "text",
          parameter_name: "bulan_tagihan",
          text: `${getMonthName(invoice.month)} ${invoice.year}`,
        },
        { type: "text", parameter_name: "total_tagihan", text: formatRupiah(invoice.amount) },
        { type: "text", parameter_name: "mata_pelajaran", text: subjectsTextFromLineItems(lineItems) },
      ],
    },
  ]
}
