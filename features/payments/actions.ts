"use server"

import { revalidatePath } from "next/cache"
import { paymentService } from "./service"
import { generateMonthlySchema } from "./validations"
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
