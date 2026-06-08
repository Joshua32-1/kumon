"use server"

import { revalidatePath } from "next/cache"
import { paymentService } from "./service"
import {
  generateMonthlySchema,
  generateCandidatesSchema,
  sendPaymentLinksSchema,
} from "./validations"
import type { GenerateMonthlyInput } from "./types"

export async function generateMonthlyAction(input: GenerateMonthlyInput) {
  const parsed = generateMonthlySchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  const result = await paymentService.generateMonthly(parsed.data)
  revalidatePath("/payments")
  return { data: result }
}

export async function listGenerateCandidatesAction(input: { month: number; year: number }) {
  const parsed = generateCandidatesSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  const result = await paymentService.listGenerateCandidates(
    parsed.data.month,
    parsed.data.year
  )
  return { data: result }
}

export async function markPaidAction(invoiceId: string) {
  const invoice = await paymentService.markPaid(invoiceId)
  revalidatePath("/payments")
  revalidatePath(`/payments/${invoiceId}`)
  return { data: invoice }
}

export async function waiveAction(invoiceId: string, notes: string) {
  const invoice = await paymentService.waive(invoiceId, notes)
  revalidatePath("/payments")
  revalidatePath(`/payments/${invoiceId}`)
  return { data: invoice }
}

export async function cancelInvoiceAction(invoiceId: string) {
  const invoice = await paymentService.cancel(invoiceId)
  revalidatePath("/payments")
  revalidatePath(`/payments/${invoiceId}`)
  return { data: invoice }
}

export async function createCheckoutAction(invoiceId: string) {
  const result = await paymentService.createCheckout(invoiceId)
  revalidatePath(`/payments/${invoiceId}`)
  return { data: result }
}

export async function regenerateInvoiceAction(invoiceId: string) {
  const result = await paymentService.regenerateInvoice(invoiceId)
  revalidatePath("/payments")
  revalidatePath(`/payments/${invoiceId}`)
  revalidatePath("/students")
  return { data: result }
}

export async function sendReminderNowAction(invoiceId: string, reminderId?: string) {
  const result = await paymentService.sendPaymentReminderForInvoice(invoiceId, {
    reminderId,
    initiatedBy: "admin",
  })
  revalidatePath("/payments")
  revalidatePath(`/payments/${invoiceId}`)
  revalidatePath("/students")
  return result
}

export async function markReminderSentManuallyAction(reminderId: string, invoiceId: string, note?: string) {
  const result = await paymentService.markReminderSentManually(reminderId, note)
  if (result.ok) {
    revalidatePath("/payments")
    revalidatePath(`/payments/${invoiceId}`)
    revalidatePath("/students")
  }
  return result
}

export async function getReminderMessagePreviewAction(invoiceId: string, reminderNumber?: number) {
  const result = await paymentService.getReminderMessagePreview(invoiceId, reminderNumber)
  return result
}

export async function sendConfirmationAction(invoiceId: string) {
  const result = await paymentService.sendPaymentConfirmationManual(invoiceId)
  revalidatePath(`/payments/${invoiceId}`)
  return result
}

export async function reconcileMidtransAction(invoiceId: string) {
  const result = await paymentService.reconcileInvoiceFromMidtrans(invoiceId)
  revalidatePath("/payments")
  revalidatePath(`/payments/${invoiceId}`)
  revalidatePath("/students")
  return result
}

export async function listPaymentLinkSendCandidatesAction(input: {
  month: number
  year: number
}) {
  const parsed = sendPaymentLinksSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  const result = await paymentService.listPaymentLinkSendCandidates(
    parsed.data.month,
    parsed.data.year
  )
  return { data: result }
}

export async function sendPaymentLinksAction(input: { month: number; year: number }) {
  const parsed = sendPaymentLinksSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  const result = await paymentService.sendPaymentLinksForPeriod(
    parsed.data.month,
    parsed.data.year
  )
  revalidatePath("/payments")
  revalidatePath("/students")
  return { data: result }
}
