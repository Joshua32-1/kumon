import { createSupabaseServerClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import {
  getMidtransSnap,
  getMidtransTransactionStatus,
  invalidateMidtransOrder,
} from "@/lib/midtrans/client"
import {
  messagingService,
  buildPaymentReminderMessage,
  type PaymentWhatsAppContext,
} from "@/features/messaging/service"
import { Errors } from "@/lib/errors"
import { DEFAULT_REMINDER_DAYS } from "@/lib/constants"
import {
  toDateString,
  todayInCenterTimezone,
  dayOfMonthFromDateString,
  monthYearFromDateString,
  isPriorBillingPeriod,
} from "@/lib/utils"
import {
  parseSubjectFees,
  computeInvoiceLineItems,
} from "@/lib/billing/fees"
import type { KumonSubject, SchoolLevel } from "@/lib/billing/fees"
import type { Contact } from "@/features/students/types"
import type {
  Invoice,
  InvoiceWithStudent,
  PaymentFilters,
  PaymentReminder,
  GenerateMonthlyInput,
  GenerateResult,
  MidtransWebhookPayload,
  MidtransWebhookResult,
  MidtransSettlementInput,
  ReconcileInvoiceResult,
  ReconcileBatchResult,
  ReminderProcessResult,
} from "./types"

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

function paymentWhatsAppContext(
  student: { full_name: string; school_level?: SchoolLevel },
  invoice?: { school_level_at_billing?: SchoolLevel }
): PaymentWhatsAppContext {
  return {
    studentName: student.full_name,
    schoolLevel:
      invoice?.school_level_at_billing ?? student.school_level ?? "ELEMENTARY",
  }
}

const BLOCKING_INVOICE_STATUSES = ["CANCELLED", "PAID_OLD_LINK"] as const

/** Students eligible for billing/reminders (excludes withdrawn students only). */
const BILLABLE_STUDENT_STATUSES = ["ACTIVE", "TEMPORARY_LEAVE"] as const

function appendOrderId(existing: string[] | null | undefined, orderId: string): string[] {
  const ids = existing ?? []
  if (ids.includes(orderId)) return ids
  return [...ids, orderId]
}

function assertSupabaseOk(error: { message: string } | null, context: string): void {
  if (error) throw Errors.INTERNAL(`Failed to update ${context}: ${error.message}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function applyMidtransSettlement(
  invoice: Invoice,
  payload: MidtransSettlementInput
): Promise<MidtransWebhookResult> {
  if (invoice.status === "PAID" || invoice.status === "PAID_OLD_LINK") {
    return { handled: true, status: invoice.status, sendConfirmation: false }
  }

  const isCurrentOrder = invoice.midtrans_order_id === payload.order_id
  const orderInHistory = (invoice.midtrans_order_ids ?? []).includes(payload.order_id)

  if (!isCurrentOrder && !orderInHistory) {
    return { handled: false, sendConfirmation: false }
  }

  const paidAt = new Date().toISOString()
  const baseUpdate = {
    paid_at: paidAt,
    midtrans_transaction_id: payload.transaction_id ?? null,
  }

  if (invoice.status === "CANCELLED" || invoice.status === "WAIVED") {
    const { error } = await supabaseAdmin
      .from("invoices")
      .update({ ...baseUpdate, status: "PAID_OLD_LINK" })
      .eq("id", invoice.id)
    assertSupabaseOk(error, "invoice")

    return { handled: true, status: "PAID_OLD_LINK", sendConfirmation: false, invoiceId: invoice.id }
  }

  if (
    (invoice.status === "PENDING" || invoice.status === "OVERDUE") &&
    !isCurrentOrder
  ) {
    const { error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .update({ ...baseUpdate, status: "PAID_OLD_LINK" })
      .eq("id", invoice.id)
    assertSupabaseOk(invoiceError, "invoice")

    const { error: reminderError } = await supabaseAdmin
      .from("payment_reminders")
      .update({ status: "FAILED" })
      .eq("invoice_id", invoice.id)
      .eq("status", "PENDING")
    assertSupabaseOk(reminderError, "payment reminders")

    return { handled: true, status: "PAID_OLD_LINK", sendConfirmation: false, invoiceId: invoice.id }
  }

  if (invoice.status === "PENDING" || invoice.status === "OVERDUE") {
    const { error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .update({ ...baseUpdate, status: "PAID" })
      .eq("id", invoice.id)
    assertSupabaseOk(invoiceError, "invoice")

    const { error: reminderError } = await supabaseAdmin
      .from("payment_reminders")
      .update({ status: "FAILED" })
      .eq("invoice_id", invoice.id)
      .eq("status", "PENDING")
    assertSupabaseOk(reminderError, "payment reminders")

    return {
      handled: true,
      status: "PAID",
      sendConfirmation: true,
      invoiceId: invoice.id,
    }
  }

  return { handled: false, sendConfirmation: false }
}

async function loadReminderDays(
  supabase: SupabaseClient | typeof supabaseAdmin
): Promise<number[]> {
  const { data: reminderConfig } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", "reminder_days")
    .returns<{ value: { days: number[] } }[]>()
    .single()
  if (reminderConfig?.value && Array.isArray((reminderConfig.value as { days: number[] }).days)) {
    return (reminderConfig.value as { days: number[] }).days
  }
  return DEFAULT_REMINDER_DAYS
}

/**
 * For OVERDUE invoices: ensure a PENDING/FAILED reminder row exists for `today` so cron
 * can send on each global reminder day (1 / 11 / 21), even after the invoice month's
 * original reminder dates have passed.
 */
async function ensureOverdueCatchUpReminder(
  invoiceId: string,
  studentId: string,
  today: string,
  whatsappNumber: string
): Promise<PaymentReminder | null> {
  const { data: existingToday } = await supabaseAdmin
    .from("payment_reminders")
    .select("*")
    .eq("invoice_id", invoiceId)
    .eq("scheduled_date", today)
    .order("reminder_number", { ascending: false })
    .limit(1)

  const todayRow = existingToday?.[0] as PaymentReminder | undefined
  if (todayRow?.status === "SENT") return null

  if (todayRow && (todayRow.status === "PENDING" || todayRow.status === "FAILED")) {
    return todayRow
  }

  await supabaseAdmin
    .from("payment_reminders")
    .update({
      status: "FAILED",
      message_preview: "Digantikan pengingat tunggakan",
    })
    .eq("invoice_id", invoiceId)
    .eq("status", "PENDING")
    .lt("scheduled_date", today)

  const { data: maxRow } = await supabaseAdmin
    .from("payment_reminders")
    .select("reminder_number")
    .eq("invoice_id", invoiceId)
    .order("reminder_number", { ascending: false })
    .limit(1)

  const nextNumber = (maxRow?.[0]?.reminder_number ?? 0) + 1

  const { data: inserted, error } = await supabaseAdmin
    .from("payment_reminders")
    .insert({
      invoice_id: invoiceId,
      student_id: studentId,
      reminder_number: nextNumber,
      scheduled_date: today,
      status: "PENDING" as const,
      whatsapp_number: whatsappNumber,
    })
    .select()
    .single()

  if (error || !inserted) return null
  return inserted as PaymentReminder
}

async function markPriorInvoicesOverdue(
  supabase: SupabaseClient | typeof supabaseAdmin,
  month: number,
  year: number
): Promise<number> {
  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "OVERDUE" })
    .eq("status", "PENDING")
    .or(`year.lt.${year},and(year.eq.${year},month.lt.${month})`)
    .select("id")

  if (error) throw Errors.INTERNAL(error.message)
  return data?.length ?? 0
}

export const paymentService = {
  async list(filters: PaymentFilters = {}): Promise<InvoiceWithStudent[]> {
    const supabase = await createSupabaseServerClient()

    let query = supabase
      .from("invoices")
      .select(
        "*, students(full_name, contacts(whatsapp_number, is_primary, full_name)), invoice_line_items(*), payment_reminders(id, reminder_number, scheduled_date, sent_at, status, message_preview)"
      )
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
        "*, students(full_name, contacts(whatsapp_number, is_primary)), payment_reminders(*), invoice_line_items(*)"
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

    const marked_overdue = await markPriorInvoicesOverdue(supabase, month, year)

    // Load subject fee config
    const { data: feeConfigRow } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "subject_fees")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .returns<{ value: Record<string, any> }[]>()
      .single()
    const feeConfig = parseSubjectFees(feeConfigRow?.value ?? {})

    // Billable students; skip months covered by temporary_leaves (not status alone)
    const { data: students } = await supabase
      .from("students")
      .select("id, school_level, student_subjects(subject)")
      .in("status", [...BILLABLE_STUDENT_STATUSES])

    if (!students || students.length === 0) {
      return {
        generated: 0,
        skipped_on_leave: 0,
        skipped_existing: 0,
        skipped_no_subjects: 0,
        invoice_ids: [],
        marked_overdue,
      }
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
      .not("status", "in", `(${BLOCKING_INVOICE_STATUSES.join(",")})`)

    const existingIds = new Set((existing ?? []).map((i) => i.student_id))

    const dueDate = toDateString(year, month, 20)

    let skippedNoSubjects = 0

    const invoicesWithLines: Array<{
      student_id: string
      month: number
      year: number
      amount: number
      status: "PENDING"
      due_date: string
      created_by: string | null
      school_level_at_billing: SchoolLevel
      lines: Array<{ subject: KumonSubject; label: string; unit_amount: number }>
    }> = []

    for (const student of students) {
      if (onLeaveIds.has(student.id) || existingIds.has(student.id)) continue

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subjects: KumonSubject[] = ((student as any).student_subjects ?? []).map(
        (ss: { subject: KumonSubject }) => ss.subject
      )

      if (subjects.length === 0) {
        skippedNoSubjects++
        continue
      }

      const schoolLevel =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((student as any).school_level as SchoolLevel) ?? "ELEMENTARY"
      const { lines, total } = computeInvoiceLineItems(schoolLevel, subjects, feeConfig)

      invoicesWithLines.push({
        student_id: student.id,
        month,
        year,
        amount: total,
        status: "PENDING",
        due_date: dueDate,
        created_by: createdBy,
        school_level_at_billing: schoolLevel,
        lines,
      })
    }

    if (invoicesWithLines.length === 0) {
      return {
        generated: 0,
        skipped_on_leave: onLeaveIds.size,
        skipped_existing: existingIds.size,
        skipped_no_subjects: skippedNoSubjects,
        invoice_ids: [],
        marked_overdue,
      }
    }

    // Insert invoices
    const { data: inserted, error } = await supabase
      .from("invoices")
      .insert(invoicesWithLines.map(({ lines: _lines, ...inv }) => inv))
      .select("id, student_id")

    if (error) throw Errors.INTERNAL(error.message)

    const invoiceIds = (inserted ?? []).map((i) => i.id)

    // Insert line items for each inserted invoice
    for (const inv of inserted ?? []) {
      const match = invoicesWithLines.find((i) => i.student_id === inv.student_id)
      if (!match) continue
      await supabase.from("invoice_line_items").insert(
        match.lines.map((line) => ({
          invoice_id: inv.id,
          subject: line.subject,
          label: line.label,
          unit_amount: line.unit_amount,
        }))
      )
    }

    const reminderDays = await loadReminderDays(supabase)

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
      skipped_no_subjects: skippedNoSubjects,
      invoice_ids: invoiceIds,
      payment_links_created: paymentLinksCreated,
      marked_overdue,
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
      .select("*, students(full_name), invoice_line_items(*)")
      .eq("id", invoiceId)
      .single()

    if (error || !invoice) throw Errors.INVOICE_NOT_FOUND()

    const snap = getMidtransSnap()
    const orderId = `INV-${invoiceId.slice(0, 8)}-${Date.now()}`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineItems: Array<{ id: string; price: number; quantity: number; name: string }> =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((invoice as any).invoice_line_items ?? []).map((item: any) => ({
        id: item.subject,
        price: item.unit_amount,
        quantity: 1,
        name: item.label,
      }))

    const result = await snap.createTransaction({
      transaction_details: {
        order_id: orderId,
        gross_amount: invoice.amount,
      },
      customer_details: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        first_name: (invoice as any).students?.full_name ?? "Siswa",
      },
      ...(lineItems.length > 0 ? { item_details: lineItems } : {}),
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invRow = invoice as any
    const orderIds = appendOrderId(invRow.midtrans_order_ids, orderId)

    await supabase
      .from("invoices")
      .update({
        midtrans_order_id: orderId,
        midtrans_payment_url: result.redirect_url,
        midtrans_order_ids: orderIds,
      })
      .eq("id", invoiceId)

    return { paymentUrl: result.redirect_url }
  },

  async findInvoiceByMidtransOrderId(orderId: string): Promise<Invoice | null> {
    const { data: byCurrent } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("midtrans_order_id", orderId)
      .maybeSingle()

    if (byCurrent) return byCurrent as Invoice

    const { data: byHistory } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .contains("midtrans_order_ids", [orderId])
      .maybeSingle()

    return byHistory ? (byHistory as Invoice) : null
  },

  async regenerateInvoice(invoiceId: string): Promise<{ paymentUrl: string }> {
    const supabase = await createSupabaseServerClient()

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("*, students(school_level, student_subjects(subject))")
      .eq("id", invoiceId)
      .single()

    if (error || !invoice) throw Errors.INVOICE_NOT_FOUND()

    const inv = invoice as Invoice & {
      students: {
        school_level: SchoolLevel
        student_subjects: Array<{ subject: KumonSubject }>
      }
    }

    if (inv.status !== "PENDING" && inv.status !== "OVERDUE") {
      throw Errors.BAD_REQUEST("Hanya tagihan belum lunas yang dapat dihitung ulang.")
    }

    const { data: feeConfigRow } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "subject_fees")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .returns<{ value: Record<string, any> }[]>()
      .single()
    const feeConfig = parseSubjectFees(feeConfigRow?.value ?? {})

    const schoolLevel = inv.students?.school_level ?? "ELEMENTARY"
    const subjects = (inv.students?.student_subjects ?? []).map((ss) => ss.subject)
    const { lines, total } = computeInvoiceLineItems(schoolLevel, subjects, feeConfig)

    await invalidateMidtransOrder(inv.midtrans_order_id)

    await supabase.from("invoice_line_items").delete().eq("invoice_id", invoiceId)

    if (lines.length > 0) {
      await supabase.from("invoice_line_items").insert(
        lines.map((line) => ({
          invoice_id: invoiceId,
          subject: line.subject,
          label: line.label,
          unit_amount: line.unit_amount,
        }))
      )
    }

    await supabase
      .from("invoices")
      .update({
        amount: total,
        school_level_at_billing: schoolLevel,
        midtrans_payment_url: null,
        midtrans_order_id: null,
      })
      .eq("id", invoiceId)

    return paymentService._createCheckout(invoiceId, supabase)
  },

  /**
   * Core send logic shared by the cron loop and manual admin triggers.
   *
   * When `reminderId` is given, that specific row is (re)used even if FAILED.
   * When `ignoreSchedule` is true, the `scheduled_date === today` gate is skipped
   * so admins can fire a reminder on any day.
   */
  async sendPaymentReminderForInvoice(
    invoiceId: string,
    options: {
      reminderId?: string
      ignoreSchedule?: boolean
      initiatedBy?: "cron" | "admin"
    } = {}
  ): Promise<{ ok: boolean; reminderId?: string; error?: string }> {
    const { reminderId, ignoreSchedule = false, initiatedBy = "cron" } = options

    // Load invoice with full context
    const { data: invoiceRow, error: invErr } = await supabaseAdmin
      .from("invoices")
      .select(
        "*, invoice_line_items(*), students(full_name, school_level, status, contacts(id, student_id, full_name, relationship, whatsapp_number, is_primary, created_at, updated_at))"
      )
      .eq("id", invoiceId)
      .single()

    if (invErr || !invoiceRow) return { ok: false, error: "Invoice not found" }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inv = invoiceRow as any
    const invoice = inv as Invoice
    const student = inv.students

    if (!student) return { ok: false, error: "Student not found" }
    if (student.status === "INACTIVE") return { ok: false, error: "Student inactive" }
    if (invoice.status !== "PENDING" && invoice.status !== "OVERDUE") {
      return { ok: false, error: `Invoice already ${invoice.status}` }
    }

    const contacts = (student.contacts ?? []) as Contact[]
    const primaryContact = contacts.find((c: Contact) => c.is_primary) ?? contacts[0]
    if (!primaryContact?.whatsapp_number) {
      return { ok: false, error: "No WhatsApp contact" }
    }

    // Resolve which reminder row to update
    let targetReminder: PaymentReminder | null = null

    if (reminderId) {
      const { data: r } = await supabaseAdmin
        .from("payment_reminders")
        .select("*")
        .eq("id", reminderId)
        .eq("invoice_id", invoiceId)
        .single()
      targetReminder = (r as PaymentReminder) ?? null
    } else {
      // Pick lowest-number FAILED or PENDING row; respect schedule unless overridden
      const today = todayInCenterTimezone()
      let q = supabaseAdmin
        .from("payment_reminders")
        .select("*")
        .eq("invoice_id", invoiceId)
        .in("status", ["PENDING", "FAILED"])
        .order("reminder_number", { ascending: true })
        .limit(1)
      if (!ignoreSchedule) q = q.lte("scheduled_date", today)
      const { data: rows } = await q
      targetReminder = rows?.[0] ? (rows[0] as PaymentReminder) : null
    }

    if (!targetReminder && ignoreSchedule) {
      const today = todayInCenterTimezone()
      const { month: currentMonth, year: currentYear } = monthYearFromDateString(today)
      const chaseableUnpaid =
        invoice.status === "OVERDUE" ||
        (invoice.status === "PENDING" &&
          isPriorBillingPeriod(invoice.month, invoice.year, currentMonth, currentYear))
      if (chaseableUnpaid) {
        targetReminder = await ensureOverdueCatchUpReminder(
          invoiceId,
          invoice.student_id,
          today,
          primaryContact.whatsapp_number
        )
      }
    }

    if (!targetReminder) {
      return { ok: false, error: "No eligible reminder row found" }
    }

    let paymentUrl: string
    try {
      paymentUrl = await paymentService.ensureCheckoutLink(invoiceId)
    } catch (err) {
      const msg = `Failed to create payment link: ${String(err)}`
      await paymentService._markReminderFailed(targetReminder.id, msg)
      return { ok: false, reminderId: targetReminder.id, error: msg }
    }

    const lineItems = inv.invoice_line_items ?? []
    const sendResult = await messagingService.sendPaymentReminder(
      invoice,
      primaryContact,
      targetReminder.reminder_number,
      paymentUrl,
      lineItems,
      paymentWhatsAppContext(student, invoice)
    )

    if (sendResult.success) {
      await supabaseAdmin
        .from("payment_reminders")
        .update({
          status: "SENT",
          sent_at: new Date().toISOString(),
          message_preview: `[${initiatedBy}] Pengingat ${targetReminder.reminder_number} — link dikirim`,
        })
        .eq("id", targetReminder.id)
      return { ok: true, reminderId: targetReminder.id }
    } else {
      const errMsg = sendResult.error ?? "WhatsApp send failed"
      await paymentService._markReminderFailed(targetReminder.id, `[${initiatedBy}] ${errMsg}`)
      return { ok: false, reminderId: targetReminder.id, error: errMsg }
    }
  },

  /**
   * Send WhatsApp reminders for the current slot.
   *
   * Designed for a four-slot morning schedule on reminder days (1/11/21):
   *   Slots 1-2 (09:00, 09:30): Phase 1 only  — current-month scheduled reminders
   *   Slots 3-4 (10:00, 10:30): Phase 1 + Phase 2 — plus overdue/prior-month chase
   *
   * Each slot sends at most `batchLimit` messages with `delayMs` between each.
   * Deduplication is automatic: Phase 1 rows become SENT; Phase 2 skips invoices
   * whose catch-up reminder for today is already SENT.
   */
  async processDueReminders(
    date?: string,
    options?: {
      batchLimit?: number
      delayMs?: number
      includeOverdueChase?: boolean
      slot?: 1 | 2 | 3 | 4
    }
  ): Promise<ReminderProcessResult> {
    const today = date ?? todayInCenterTimezone()
    const batchLimit = options?.batchLimit ?? Number(process.env.WHATSAPP_BATCH_LIMIT ?? 100)
    const delayMs = options?.delayMs ?? Number(process.env.WHATSAPP_SEND_DELAY_MS ?? 2000)
    const includeOverdueChase = options?.includeOverdueChase ?? true
    const slot = options?.slot

    const result: ReminderProcessResult = {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      slot,
      truncated: false,
      includeOverdueChase,
    }

    const reminderDays = await loadReminderDays(supabaseAdmin)
    const processedInvoiceIds = new Set<string>()

    const recordOutcome = (outcome: { ok: boolean; error?: string }) => {
      if (outcome.ok) {
        result.sent++
      } else {
        const skip =
          outcome.error?.startsWith("Invoice already") || outcome.error === "Student inactive"
        if (skip) result.skipped++
        else result.failed++
      }
    }

    // Phase 1: this month's scheduled reminders (scheduled_date === today)
    const { data: reminders, error } = await supabaseAdmin
      .from("payment_reminders")
      .select("id, invoice_id")
      .eq("scheduled_date", today)
      .eq("status", "PENDING")

    if (error) throw Errors.INTERNAL(error.message)

    for (const reminder of reminders ?? []) {
      if (result.processed >= batchLimit) {
        result.truncated = true
        return result
      }
      result.processed++
      processedInvoiceIds.add(reminder.invoice_id)
      const outcome = await paymentService.sendPaymentReminderForInvoice(
        reminder.invoice_id,
        { reminderId: reminder.id, initiatedBy: "cron" }
      )
      recordOutcome(outcome)
      if (result.processed < batchLimit) await sleep(delayMs)
    }

    // Phase 2: prior-month OVERDUE invoices on each global reminder day (1 / 11 / 21)
    const dayOfMonth = dayOfMonthFromDateString(today)
    if (!includeOverdueChase || !reminderDays.includes(dayOfMonth)) {
      return result
    }

    const { month: currentMonth, year: currentYear } = monthYearFromDateString(today)

    const { data: unpaidPriorRows, error: overdueErr } = await supabaseAdmin
      .from("invoices")
      .select("id, student_id, month, year, status, students(status)")
      .in("status", ["OVERDUE", "PENDING"])

    if (overdueErr) throw Errors.INTERNAL(overdueErr.message)

    for (const row of unpaidPriorRows ?? []) {
      if (result.processed >= batchLimit) {
        result.truncated = true
        return result
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inv = row as any
      if (inv.status === "PENDING") {
        if (!isPriorBillingPeriod(inv.month, inv.year, currentMonth, currentYear)) {
          continue
        }
      } else if (inv.status !== "OVERDUE") {
        continue
      }

      const studentStatus = inv.students?.status as string | undefined
      if (
        !studentStatus ||
        !(BILLABLE_STUDENT_STATUSES as readonly string[]).includes(studentStatus)
      ) {
        continue
      }
      if (processedInvoiceIds.has(inv.id)) continue

      const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("whatsapp_number")
        .eq("student_id", inv.student_id)
        .eq("is_primary", true)
        .single()

      if (!contact?.whatsapp_number) {
        result.skipped++
        continue
      }

      const catchUp = await ensureOverdueCatchUpReminder(
        inv.id,
        inv.student_id,
        today,
        contact.whatsapp_number
      )
      if (!catchUp) {
        result.skipped++
        continue
      }

      result.processed++
      processedInvoiceIds.add(inv.id)
      const outcome = await paymentService.sendPaymentReminderForInvoice(
        inv.id,
        { reminderId: catchUp.id, initiatedBy: "cron" }
      )
      recordOutcome(outcome)
      if (result.processed < batchLimit) await sleep(delayMs)
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

  /** Mark a reminder row as manually sent without going through Fonnte. */
  async markReminderSentManually(reminderId: string, note?: string): Promise<void> {
    const label = note ? `Manual: ${note}` : "Manual: terkirim oleh admin"
    await supabaseAdmin
      .from("payment_reminders")
      .update({
        status: "SENT",
        sent_at: new Date().toISOString(),
        message_preview: label.slice(0, 200),
      })
      .eq("id", reminderId)
  },

  /** Build the WA reminder message text for copy-paste without sending. */
  async getReminderMessagePreview(
    invoiceId: string,
    reminderNumber?: number
  ): Promise<{ message: string; paymentUrl: string; whatsappNumber: string } | null> {
    const { data: invRow } = await supabaseAdmin
      .from("invoices")
      .select(
        "*, invoice_line_items(*), students(full_name, school_level, contacts(full_name, whatsapp_number, is_primary))"
      )
      .eq("id", invoiceId)
      .single()

    if (!invRow) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inv = invRow as any
    const student = inv.students
    if (!student?.full_name) return null

    const contacts = (student.contacts ?? []) as Contact[]
    const primaryContact = contacts.find((c: Contact) => c.is_primary) ?? contacts[0]
    if (!primaryContact?.whatsapp_number) return null

    let paymentUrl: string
    try {
      paymentUrl = await paymentService.ensureCheckoutLink(invoiceId)
    } catch {
      return null
    }

    // Pick reminder number: given, or first pending/failed, or 1
    let num = reminderNumber ?? 1
    if (!reminderNumber) {
      const { data: rows } = await supabaseAdmin
        .from("payment_reminders")
        .select("reminder_number")
        .eq("invoice_id", invoiceId)
        .in("status", ["PENDING", "FAILED"])
        .order("reminder_number", { ascending: true })
        .limit(1)
      if (rows?.[0]) num = rows[0].reminder_number
    }

    const invoice = inv as Invoice
    const lineItems = inv.invoice_line_items ?? []
    const message = buildPaymentReminderMessage({
      contactName: primaryContact.full_name ?? "",
      studentName: student.full_name,
      schoolLevel:
        (invoice as Invoice).school_level_at_billing ??
        student.school_level ??
        "ELEMENTARY",
      invoice,
      reminderNumber: num,
      paymentUrl,
      lineItems,
    })

    return { message, paymentUrl, whatsappNumber: primaryContact.whatsapp_number }
  },

  /** Send payment confirmation WA after settlement (webhook or reconcile). */
  async sendPaymentConfirmationForInvoice(
    invoiceId: string
  ): Promise<{ ok: boolean; error?: string }> {
    const { data: invRow } = await supabaseAdmin
      .from("invoices")
      .select(
        "*, invoice_line_items(*), students(full_name, school_level, contacts(full_name, whatsapp_number, is_primary))"
      )
      .eq("id", invoiceId)
      .single()

    if (!invRow) return { ok: false, error: "Invoice not found" }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inv = invRow as any
    if (inv.status !== "PAID") return { ok: false, error: "Invoice not paid" }

    const student = inv.students
    if (!student?.full_name) return { ok: false, error: "Student not found" }

    const contacts = (student.contacts ?? []) as Contact[]
    const primaryContact = contacts.find((c: Contact) => c.is_primary) ?? contacts[0]
    if (!primaryContact?.whatsapp_number) return { ok: false, error: "No WhatsApp contact" }

    const result = await messagingService.sendPaymentConfirmation(
      inv as Invoice,
      primaryContact,
      inv.invoice_line_items ?? [],
      paymentWhatsAppContext(student, inv as Invoice)
    )

    return result.success ? { ok: true } : { ok: false, error: result.error ?? "Send failed" }
  },

  /** Resend payment confirmation WA for an already-paid invoice. */
  async sendPaymentConfirmationManual(invoiceId: string): Promise<{ ok: boolean; error?: string }> {
    return paymentService.sendPaymentConfirmationForInvoice(invoiceId)
  },

  async handleMidtransWebhook(payload: MidtransWebhookPayload): Promise<MidtransWebhookResult> {
    const isSuccess =
      payload.transaction_status === "settlement" ||
      payload.transaction_status === "capture"
    const isFraud = payload.fraud_status === "deny"

    if (!isSuccess || isFraud) return { handled: false, sendConfirmation: false }

    const invoice = await paymentService.findInvoiceByMidtransOrderId(payload.order_id)
    if (!invoice) return { handled: false, sendConfirmation: false }

    return applyMidtransSettlement(invoice, {
      order_id: payload.order_id,
      transaction_id: payload.transaction_id ?? null,
      transaction_status: payload.transaction_status,
      fraud_status: payload.fraud_status,
    })
  },

  /** Poll Midtrans for a successful payment and sync invoice status. */
  async reconcileInvoiceFromMidtrans(invoiceId: string): Promise<ReconcileInvoiceResult> {
    const { data: invoice, error } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single()

    if (error || !invoice) {
      return { ok: false, synced: false, message: "Tagihan tidak ditemukan." }
    }

    const inv = invoice as Invoice
    if (
      inv.status === "PAID" ||
      inv.status === "PAID_OLD_LINK" ||
      inv.status === "CANCELLED" ||
      inv.status === "WAIVED"
    ) {
      return {
        ok: true,
        synced: false,
        status: inv.status,
        message: "Tagihan sudah dalam status final.",
      }
    }

    const orderIds = [
      inv.midtrans_order_id,
      ...(inv.midtrans_order_ids ?? []),
    ].filter((id): id is string => !!id)
    const uniqueOrderIds = [...new Set(orderIds)]

    if (uniqueOrderIds.length === 0) {
      return { ok: true, synced: false, message: "Belum ada order Midtrans." }
    }

    for (const orderId of uniqueOrderIds) {
      const status = await getMidtransTransactionStatus(orderId)
      if (!status) continue

      const isSuccess =
        status.transaction_status === "settlement" ||
        status.transaction_status === "capture"
      const isFraud = status.fraud_status === "deny"
      if (!isSuccess || isFraud) continue

      const result = await applyMidtransSettlement(inv, {
        order_id: orderId,
        transaction_id: status.transaction_id ?? null,
        transaction_status: status.transaction_status,
        fraud_status: status.fraud_status,
      })

      if (!result.handled) continue

      if (result.sendConfirmation && result.invoiceId) {
        await paymentService.sendPaymentConfirmationForInvoice(result.invoiceId)
      }

      return {
        ok: true,
        synced: true,
        status: result.status,
        message:
          result.status === "PAID"
            ? "Pembayaran tersinkron dari Midtrans."
            : "Pembayaran via link lama tersinkron dari Midtrans.",
      }
    }

    return { ok: true, synced: false, message: "Belum ada pembayaran di Midtrans." }
  },

  /** Batch reconcile unpaid invoices with Midtrans links (cron). */
  async reconcileUnpaidInvoices(options?: {
    minAgeHours?: number
  }): Promise<ReconcileBatchResult> {
    const minAgeHours = options?.minAgeHours ?? 6
    const cutoff = new Date(Date.now() - minAgeHours * 60 * 60 * 1000).toISOString()

    const { data: invoices, error } = await supabaseAdmin
      .from("invoices")
      .select("id")
      .in("status", ["PENDING", "OVERDUE"])
      .not("midtrans_order_id", "is", null)
      .lte("created_at", cutoff)

    assertSupabaseOk(error, "invoices query")

    let synced = 0
    const errors: ReconcileBatchResult["errors"] = []

    for (const row of invoices ?? []) {
      try {
        const result = await paymentService.reconcileInvoiceFromMidtrans(row.id)
        if (result.synced) synced++
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error"
        console.error(`Reconcile failed for invoice ${row.id}:`, err)
        errors.push({ invoiceId: row.id, error: msg })
      }
    }

    return { checked: invoices?.length ?? 0, synced, errors }
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

    const { data: existing, error: fetchError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single()

    if (fetchError || !existing) throw Errors.INVOICE_NOT_FOUND()

    const inv = existing as Invoice
    if (inv.status !== "PENDING" && inv.status !== "OVERDUE") {
      throw Errors.BAD_REQUEST("Hanya tagihan belum lunas yang dapat dibatalkan.")
    }

    await invalidateMidtransOrder(inv.midtrans_order_id)

    const { data, error } = await supabase
      .from("invoices")
      .update({
        status: "CANCELLED",
        midtrans_payment_url: null,
      })
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
