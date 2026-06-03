import { createSupabaseServerClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getMidtransSnap } from "@/lib/midtrans/client"
import { messagingService } from "@/features/messaging/service"
import { Errors } from "@/lib/errors"
import { DEFAULT_MONTHLY_FEE, DEFAULT_REMINDER_DAYS } from "@/lib/constants"
import { toDateString, todayInCenterTimezone } from "@/lib/utils"
import type { Contact } from "@/features/students/types"
import type {
  Invoice,
  InvoiceWithStudent,
  PaymentFilters,
  GenerateMonthlyInput,
  GenerateResult,
  MidtransWebhookPayload,
  ReminderProcessResult,
} from "./types"

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

export const paymentService = {
  async list(filters: PaymentFilters = {}): Promise<InvoiceWithStudent[]> {
    const supabase = await createSupabaseServerClient()

    let query = supabase
      .from("invoices")
      .select("*, students(full_name, contacts(whatsapp_number, is_primary))")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .order("created_at", { ascending: false })

    if (filters.status) query = query.eq("status", filters.status)
    if (filters.month) query = query.eq("month", filters.month)
    if (filters.year) query = query.eq("year", filters.year)
    if (filters.student_id) query = query.eq("student_id", filters.student_id)

    const { data, error } = await query
    if (error) throw Errors.INTERNAL(error.message)
    return data as unknown as InvoiceWithStudent[]
  },

  async getById(id: string): Promise<InvoiceWithStudent> {
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
      .from("invoices")
      .select(
        "*, students(full_name, contacts(whatsapp_number, is_primary)), payment_reminders(*)"
      )
      .eq("id", id)
      .single()

    if (error || !data) throw Errors.INVOICE_NOT_FOUND()
    return data as unknown as InvoiceWithStudent
  },

  /** Manual admin flow (requires authenticated session). */
  async generateMonthly(input: GenerateMonthlyInput): Promise<GenerateResult> {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    return paymentService._generateMonthlyInternal(input, {
      supabase,
      createdBy: user?.id ?? null,
      createPaymentLinks: true,
    })
  },

  /** Cron/automation flow (uses service role, no session). */
  async generateMonthlyAutomated(input: GenerateMonthlyInput): Promise<GenerateResult> {
    return paymentService._generateMonthlyInternal(input, {
      supabase: supabaseAdmin,
      createdBy: null,
      createPaymentLinks: true,
    })
  },

  async _generateMonthlyInternal(
    input: GenerateMonthlyInput,
    options: {
      supabase: SupabaseClient | typeof supabaseAdmin
      createdBy: string | null
      createPaymentLinks: boolean
    }
  ): Promise<GenerateResult> {
    const { supabase, createdBy, createPaymentLinks } = options
    const { month, year } = input

    let amount = input.amount ?? DEFAULT_MONTHLY_FEE
    if (!input.amount) {
      const { data: config } = await supabase
        .from("system_config")
        .select("value")
        .eq("key", "monthly_fee")
        .returns<{ value: { amount: number } }[]>()
        .single()
      if (config?.value) {
        amount = (config.value as { amount: number }).amount
      }
    }

    const { data: students } = await supabase
      .from("students")
      .select("id")
      .eq("status", "ACTIVE")

    if (!students || students.length === 0) {
      return { generated: 0, skipped_on_leave: 0, skipped_existing: 0, invoice_ids: [] }
    }

    const studentIds = students.map((s) => s.id)

    const { data: leaves } = await supabase
      .from("temporary_leaves")
      .select("student_id")
      .eq("month", month)
      .eq("year", year)
      .in("student_id", studentIds)

    const onLeaveIds = new Set((leaves ?? []).map((l) => l.student_id))

    const { data: existing } = await supabase
      .from("invoices")
      .select("student_id")
      .eq("month", month)
      .eq("year", year)
      .in("student_id", studentIds)

    const existingIds = new Set((existing ?? []).map((i) => i.student_id))

    const dueDate = toDateString(year, month, 20)

    const invoicesToInsert = studentIds
      .filter((id) => !onLeaveIds.has(id) && !existingIds.has(id))
      .map((student_id) => ({
        student_id,
        month,
        year,
        amount,
        status: "PENDING" as const,
        due_date: dueDate,
        created_by: createdBy,
      }))

    if (invoicesToInsert.length === 0) {
      return {
        generated: 0,
        skipped_on_leave: onLeaveIds.size,
        skipped_existing: existingIds.size,
        invoice_ids: [],
      }
    }

    const { data: inserted, error } = await supabase
      .from("invoices")
      .insert(invoicesToInsert)
      .select("id, student_id")

    if (error) throw Errors.INTERNAL(error.message)

    const invoiceIds = (inserted ?? []).map((i) => i.id)

    let reminderDays = DEFAULT_REMINDER_DAYS
    const { data: reminderConfig } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "reminder_days")
      .returns<{ value: { days: number[] } }[]>()
      .single()
    if (reminderConfig?.value) {
      reminderDays = (reminderConfig.value as { days: number[] }).days
    }

    for (const invoice of inserted ?? []) {
      await paymentService.scheduleReminders(
        invoice.id,
        invoice.student_id,
        month,
        year,
        reminderDays,
        supabase
      )
    }

    let paymentLinksCreated = 0
    if (createPaymentLinks) {
      paymentLinksCreated = await paymentService.createCheckoutLinksForInvoices(invoiceIds)
    }

    return {
      generated: invoiceIds.length,
      skipped_on_leave: onLeaveIds.size,
      skipped_existing: existingIds.size,
      invoice_ids: invoiceIds,
      payment_links_created: paymentLinksCreated,
    }
  },

  async scheduleReminders(
    invoiceId: string,
    studentId: string,
    month: number,
    year: number,
    reminderDays: number[],
    supabase?: SupabaseClient | typeof supabaseAdmin
  ): Promise<void> {
    const db = supabase ?? (await createSupabaseServerClient())

    const { data: contact } = await db
      .from("contacts")
      .select("whatsapp_number")
      .eq("student_id", studentId)
      .eq("is_primary", true)
      .single()

    if (!contact) return

    const reminders = reminderDays.map((day, index) => ({
      invoice_id: invoiceId,
      student_id: studentId,
      reminder_number: index + 1,
      scheduled_date: toDateString(year, month, day),
      status: "PENDING" as const,
      whatsapp_number: contact.whatsapp_number,
    }))

    await db.from("payment_reminders").insert(reminders)
  },

  async createCheckout(invoiceId: string): Promise<{ paymentUrl: string }> {
    const supabase = await createSupabaseServerClient()
    return paymentService._createCheckout(invoiceId, supabase)
  },

  async ensureCheckoutLink(invoiceId: string): Promise<string> {
    const { data: invoice } = await supabaseAdmin
      .from("invoices")
      .select("midtrans_payment_url")
      .eq("id", invoiceId)
      .single()

    if (invoice?.midtrans_payment_url) return invoice.midtrans_payment_url

    const { paymentUrl } = await paymentService._createCheckout(invoiceId, supabaseAdmin)
    return paymentUrl
  },

  async createCheckoutLinksForInvoices(invoiceIds: string[]): Promise<number> {
    let created = 0
    for (const id of invoiceIds) {
      try {
        await paymentService.ensureCheckoutLink(id)
        created++
      } catch (err) {
        console.error(`Failed to create checkout link for invoice ${id}:`, err)
      }
    }
    return created
  },

  async _createCheckout(
    invoiceId: string,
    supabase: SupabaseClient | typeof supabaseAdmin
  ): Promise<{ paymentUrl: string }> {
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("*, students(full_name)")
      .eq("id", invoiceId)
      .single()

    if (error || !invoice) throw Errors.INVOICE_NOT_FOUND()

    const snap = getMidtransSnap()
    const orderId = `INV-${invoiceId.slice(0, 8)}-${Date.now()}`

    const result = await snap.createTransaction({
      transaction_details: {
        order_id: orderId,
        gross_amount: invoice.amount,
      },
      customer_details: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        first_name: (invoice as any).students?.full_name ?? "Siswa",
      },
    })

    await supabase
      .from("invoices")
      .update({
        midtrans_order_id: orderId,
        midtrans_payment_url: result.redirect_url,
      })
      .eq("id", invoiceId)

    return { paymentUrl: result.redirect_url }
  },

  /** Send WhatsApp reminders due today (days 1, 11, 21 by default). */
  async processDueReminders(date?: string): Promise<ReminderProcessResult> {
    const today = date ?? todayInCenterTimezone()
    const result: ReminderProcessResult = {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    }

    const { data: reminders, error } = await supabaseAdmin
      .from("payment_reminders")
      .select(
        "*, invoices(*, students(full_name, status, contacts(id, student_id, full_name, relationship, whatsapp_number, is_primary, created_at, updated_at)))"
      )
      .eq("scheduled_date", today)
      .eq("status", "PENDING")

    if (error) throw Errors.INTERNAL(error.message)
    if (!reminders || reminders.length === 0) return result

    for (const reminder of reminders) {
      result.processed++
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reminderAny = reminder as any
      const invoice = reminderAny.invoices as Invoice | null
      const student = reminderAny.invoices?.students

      if (!invoice || !student) {
        await paymentService._markReminderFailed(reminder.id, "Invoice or student not found")
        result.failed++
        continue
      }

      if (student.status !== "ACTIVE") {
        await paymentService._markReminderFailed(reminder.id, "Student not active")
        result.skipped++
        continue
      }

      if (invoice.status !== "PENDING" && invoice.status !== "OVERDUE") {
        await paymentService._markReminderFailed(reminder.id, `Invoice status: ${invoice.status}`)
        result.skipped++
        continue
      }

      const contacts = (student.contacts ?? []) as Contact[]
      const primaryContact =
        contacts.find((c) => c.is_primary) ?? contacts[0]

      if (!primaryContact?.whatsapp_number) {
        await paymentService._markReminderFailed(reminder.id, "No WhatsApp contact")
        result.failed++
        continue
      }

      let paymentUrl: string
      try {
        paymentUrl = await paymentService.ensureCheckoutLink(invoice.id)
      } catch (err) {
        console.error(`Checkout link failed for invoice ${invoice.id}:`, err)
        await paymentService._markReminderFailed(reminder.id, "Failed to create payment link")
        result.failed++
        continue
      }

      const sendResult = await messagingService.sendPaymentReminder(
        invoice,
        primaryContact,
        reminder.reminder_number,
        paymentUrl
      )

      if (sendResult.success) {
        await supabaseAdmin
          .from("payment_reminders")
          .update({
            status: "SENT",
            sent_at: new Date().toISOString(),
            message_preview: `Reminder ${reminder.reminder_number} with payment link`,
          })
          .eq("id", reminder.id)
        result.sent++
      } else {
        await paymentService._markReminderFailed(
          reminder.id,
          sendResult.error ?? "WhatsApp send failed"
        )
        result.failed++
      }
    }

    return result
  },

  async _markReminderFailed(reminderId: string, reason: string): Promise<void> {
    await supabaseAdmin
      .from("payment_reminders")
      .update({
        status: "FAILED",
        message_preview: reason.slice(0, 200),
      })
      .eq("id", reminderId)
  },

  async handleMidtransWebhook(payload: MidtransWebhookPayload): Promise<void> {
    const isSuccess =
      payload.transaction_status === "settlement" ||
      payload.transaction_status === "capture"
    const isFraud = payload.fraud_status === "deny"

    if (!isSuccess || isFraud) return

    const { data: invoice } = await supabaseAdmin
      .from("invoices")
      .select("id, student_id, month, year, amount, students(full_name, contacts(whatsapp_number, is_primary))")
      .eq("midtrans_order_id", payload.order_id)
      .single()

    if (!invoice) return

    await supabaseAdmin
      .from("invoices")
      .update({
        status: "PAID",
        paid_at: new Date().toISOString(),
        midtrans_transaction_id: payload.transaction_id ?? null,
      })
      .eq("id", invoice.id)

    await supabaseAdmin
      .from("payment_reminders")
      .update({ status: "FAILED" })
      .eq("invoice_id", invoice.id)
      .eq("status", "PENDING")
  },

  async markPaid(invoiceId: string): Promise<Invoice> {
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
      .from("invoices")
      .update({ status: "PAID", paid_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .select()
      .single()

    if (error || !data) throw Errors.INVOICE_NOT_FOUND()

    await supabase
      .from("payment_reminders")
      .update({ status: "FAILED" })
      .eq("invoice_id", invoiceId)
      .eq("status", "PENDING")

    return data as Invoice
  },

  async waive(invoiceId: string, notes: string): Promise<Invoice> {
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
      .from("invoices")
      .update({ status: "WAIVED", notes })
      .eq("id", invoiceId)
      .select()
      .single()

    if (error || !data) throw Errors.INVOICE_NOT_FOUND()

    await supabase
      .from("payment_reminders")
      .update({ status: "FAILED" })
      .eq("invoice_id", invoiceId)
      .eq("status", "PENDING")

    return data as Invoice
  },

  async cancel(invoiceId: string): Promise<Invoice> {
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
      .from("invoices")
      .update({ status: "CANCELLED" })
      .eq("id", invoiceId)
      .select()
      .single()

    if (error || !data) throw Errors.INVOICE_NOT_FOUND()

    await supabase
      .from("payment_reminders")
      .update({ status: "FAILED" })
      .eq("invoice_id", invoiceId)
      .eq("status", "PENDING")

    return data as Invoice
  },

}
