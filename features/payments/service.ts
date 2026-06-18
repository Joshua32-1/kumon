import { createSupabaseServerClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import {
  getMidtransSnap,
  getMidtransTransactionStatus,
  invalidateMidtransOrder,
} from "@/lib/midtrans/client"
import {
  buildPaymentLink,
  generatePaymentAccessToken,
} from "@/lib/payments/pay-link"
import {
  messagingService,
  buildPaymentReminderMessage,
  type PaymentWhatsAppContext,
} from "@/features/messaging/service"
import { Errors } from "@/lib/errors"
import { DEFAULT_REMINDER_DAYS, BILLABLE_STUDENT_STATUSES } from "@/lib/constants"
import {
  toDateString,
  lastDayOfMonth,
  todayInCenterTimezone,
  monthYearFromDateString,
  currentMonthYearInCenterTimezone,
} from "@/lib/utils"
import {
  computeInvoiceLineItems,
} from "@/lib/billing/fees"
import type { KumonSubject, SchoolLevel } from "@/lib/billing/fees"
import {
  isBillingPeriodBeforeEnrollment,
  isPastBillingPeriod,
  filterSubjectsForBillingPeriod,
} from "@/lib/billing/billing-period"
import { loadSubjectFeesForPeriod } from "@/lib/billing/load-subject-fees"
import type { Contact } from "@/features/students/types"
import type {
  Invoice,
  InvoiceWithStudent,
  PaymentFilters,
  PaymentReminder,
  PaymentStatus,
  GenerateMonthlyInput,
  GenerateResult,
  MarkOverdueResult,
  CheckoutLinksResult,
  BackfillLinksResult,
  GenerateCandidate,
  GenerateInvoiceCategory,
  GenerateCandidatesResult,
  GeneratePeriodInfo,
  MidtransWebhookPayload,
  MidtransWebhookResult,
  MidtransSettlementInput,
  ReconcileInvoiceResult,
  ReconcileBatchResult,
  ReminderProcessResult,
  PaymentLinkSendCandidatesResult,
  SendPaymentLinksResult,
  LeaveMonthInvoice,
  LeaveInvoiceCancelResult,
  PaidLeaveConflict,
} from "./types"
import {
  getWhatsAppDeliveryStatus,
  type WhatsAppDeliveryStatus,
} from "./billing-summary"
import { DEFAULT_GENERATE_CATEGORIES } from "./types"
import {
  decideMidtransSettlement,
  isValidMidtransSettlement,
  appendOrderId,
} from "@/lib/payments/settlement"
import { evaluatePayPageAccess } from "@/lib/payments/pay-page"
import { isWithinSnapPageWindow, isExpiryTimeInFuture } from "@/lib/midtrans/expiry"
import { isRetryableMidtransError } from "@/lib/midtrans/errors"
import {
  getStudentSubjects,
  evaluateStudentBillingEligibility,
  getEffectiveInvoiceStatus,
  canGenerateInvoiceForStudent,
  studentMatchesGenerateCategories,
  type InvoiceStatusRow,
  type StudentSubjectRow,
} from "@/lib/billing/generate-eligibility"
import {
  isReminderDay,
  isOverdueChaseEligible,
  selectDueReminder,
} from "@/lib/billing/reminder-selection"

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

function assertSupabaseOk(error: { message: string } | null, context: string): void {
  if (error) throw Errors.INTERNAL(`Failed to update ${context}: ${error.message}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withMidtransRetry<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  const maxAttempts = Number(process.env.MIDTRANS_RETRY_ATTEMPTS ?? 4)
  const baseDelayMs = Number(process.env.MIDTRANS_RETRY_BASE_DELAY_MS ?? 2000)

  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === maxAttempts || !isRetryableMidtransError(err)) throw err
      const delayMs = baseDelayMs * 2 ** (attempt - 1)
      console.warn(
        `Midtrans ${context} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms:`,
        err
      )
      await sleep(delayMs)
    }
  }
  throw lastErr
}

function getMidtransPageExpiryHours(): number {
  return Number(process.env.MIDTRANS_PAGE_EXPIRY_HOURS ?? 24)
}

async function isMidtransCheckoutReusable(
  invoice: Pick<
    Invoice,
    "midtrans_order_id" | "midtrans_payment_url" | "midtrans_snap_created_at"
  >
): Promise<boolean> {
  const { midtrans_order_id, midtrans_payment_url, midtrans_snap_created_at } = invoice
  if (!midtrans_order_id || !midtrans_payment_url) return false

  const status = await getMidtransTransactionStatus(midtrans_order_id)

  if (!status) {
    return isWithinSnapPageWindow(midtrans_snap_created_at, getMidtransPageExpiryHours())
  }

  if (
    status.transaction_status === "expire" ||
    status.transaction_status === "cancel"
  ) {
    return false
  }

  if (status.transaction_status === "pending") {
    if (status.expiry_time && isExpiryTimeInFuture(status.expiry_time)) return true
    return isWithinSnapPageWindow(midtrans_snap_created_at, getMidtransPageExpiryHours())
  }

  return false
}

export type PayPageOutcome =
  | { kind: "redirect"; url: string }
  | { kind: "message"; title: string; body: string }

async function cancelPendingReminders(
  invoiceId: string,
  reason: string,
  supabase: SupabaseClient | typeof supabaseAdmin
): Promise<void> {
  const { error } = await supabase
    .from("payment_reminders")
    .update({
      status: "CANCELLED",
      message_preview: reason.slice(0, 200),
    })
    .eq("invoice_id", invoiceId)
    .eq("status", "PENDING")
  assertSupabaseOk(error, "payment reminders")
}

async function applyMidtransSettlement(
  invoice: Invoice,
  payload: MidtransSettlementInput
): Promise<MidtransWebhookResult> {
  const decision = decideMidtransSettlement({
    currentStatus: invoice.status,
    isCurrentOrder: invoice.midtrans_order_id === payload.order_id,
    orderInHistory: (invoice.midtrans_order_ids ?? []).includes(payload.order_id),
  })

  if (decision.action === "already_settled") {
    return { handled: true, status: decision.status, sendConfirmation: false }
  }

  if (decision.action === "unrelated") {
    return { handled: false, sendConfirmation: false }
  }

  const { error } = await supabaseAdmin
    .from("invoices")
    .update({
      paid_at: new Date().toISOString(),
      midtrans_transaction_id: payload.transaction_id ?? null,
      status: decision.newStatus,
    })
    .eq("id", invoice.id)
  assertSupabaseOk(error, "invoice")

  if (decision.cancelReminders) {
    await cancelPendingReminders(invoice.id, "Tagihan sudah lunas", supabaseAdmin)
  }

  return {
    handled: true,
    status: decision.newStatus,
    sendConfirmation: decision.sendConfirmation,
    invoiceId: invoice.id,
  }
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
      status: "CANCELLED",
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

/** Flip every PENDING invoice past its due date to OVERDUE. Idempotent. Returns count. */
async function markOverdueInvoices(
  supabase: SupabaseClient | typeof supabaseAdmin,
  today: string
): Promise<number> {
  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "OVERDUE" })
    .eq("status", "PENDING")
    .lt("due_date", today) // string compare on YYYY-MM-DD
    .select("id")

  if (error) throw Errors.INTERNAL(error.message)
  return data?.length ?? 0
}

/**
 * Called when a guarded status transition (markPaid/waive) updated zero rows.
 * Disambiguates a missing invoice (404) from a disallowed transition (400).
 * Always throws.
 */
async function assertInvoiceTransitionFailure(
  supabase: SupabaseClient | typeof supabaseAdmin,
  invoiceId: string,
  badStatusMessage: string
): Promise<never> {
  const { data: existing } = await supabase
    .from("invoices")
    .select("id")
    .eq("id", invoiceId)
    .maybeSingle()

  if (!existing) throw Errors.INVOICE_NOT_FOUND()
  throw Errors.BAD_REQUEST(badStatusMessage)
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

  async listGenerateCandidates(
    month: number,
    year: number
  ): Promise<GenerateCandidatesResult> {
    const supabase = await createSupabaseServerClient()

    const { data: students } = await supabase
      .from("students")
      .select("id, full_name, status, enrolled_at, student_subjects(subject, enrolled_at)")
      .in("status", [...BILLABLE_STUDENT_STATUSES])
      .order("full_name", { ascending: true })

    const period: GeneratePeriodInfo = {
      is_past: isPastBillingPeriod(month, year),
      fee_effective_month: null,
      fee_effective_year: null,
    }

    if (!students || students.length === 0) {
      return { candidates: [], period }
    }

    const { effectiveEntry } = await loadSubjectFeesForPeriod(supabase, month, year)
    if (effectiveEntry) {
      period.fee_effective_month = effectiveEntry.month
      period.fee_effective_year = effectiveEntry.year
    }

    const studentIds = students.map((s) => s.id)

    const { data: leaves } = await supabase
      .from("temporary_leaves")
      .select("student_id")
      .eq("month", month)
      .eq("year", year)
      .in("student_id", studentIds)

    const onLeaveIds = new Set((leaves ?? []).map((l) => l.student_id))

    const { data: invoiceRows } = await supabase
      .from("invoices")
      .select("student_id, status, created_at")
      .eq("month", month)
      .eq("year", year)
      .in("student_id", studentIds)

    const invoicesByStudent = new Map<string, InvoiceStatusRow[]>()
    for (const row of invoiceRows ?? []) {
      const list = invoicesByStudent.get(row.student_id) ?? []
      list.push(row as InvoiceStatusRow)
      invoicesByStudent.set(row.student_id, list)
    }

    const candidates = students.map((student) => {
      const subjects = getStudentSubjects(student as { student_subjects?: StudentSubjectRow[] })
      const invoiceStatus = getEffectiveInvoiceStatus(
        invoicesByStudent.get(student.id) ?? []
      )
      const onLeave = onLeaveIds.has(student.id)
      const eligibility = evaluateStudentBillingEligibility({
        enrolledAt: student.enrolled_at,
        subjects,
        billingMonth: month,
        billingYear: year,
        onLeave,
        invoiceStatus,
      })

      return {
        student_id: student.id,
        full_name: student.full_name,
        student_status: student.status as "ACTIVE" | "TEMPORARY_LEAVE",
        enrolled_at: student.enrolled_at,
        invoice_status: invoiceStatus,
        on_leave: onLeave,
        has_subjects: eligibility.hasSubjects,
        before_enrollment: eligibility.beforeEnrollment,
        can_generate: eligibility.canGenerate,
      }
    })

    return { candidates, period }
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
    })
  },

  /** Cron/automation flow (uses service role, no session). */
  async generateMonthlyAutomated(input: GenerateMonthlyInput): Promise<GenerateResult> {
    return paymentService._generateMonthlyInternal(input, {
      supabase: supabaseAdmin,
      createdBy: null,
    })
  },

  async _generateMonthlyInternal(
    input: GenerateMonthlyInput,
    options: {
      supabase: SupabaseClient | typeof supabaseAdmin
      createdBy: string | null
    }
  ): Promise<GenerateResult> {
    const { supabase, createdBy } = options
    const { month, year, categories, student_ids } = input
    const allowedCategories = categories ?? DEFAULT_GENERATE_CATEGORIES
    const selectedStudentIds = student_ids ? new Set(student_ids) : null

    const marked_overdue = await markOverdueInvoices(supabase, todayInCenterTimezone())

    const { fees: feeConfig } = await loadSubjectFeesForPeriod(supabase, month, year)

    // Billable students; skip months covered by temporary_leaves (not status alone)
    const { data: students } = await supabase
      .from("students")
      .select("id, school_level, enrolled_at, student_subjects(subject, enrolled_at)")
      .in("status", [...BILLABLE_STUDENT_STATUSES])

    if (!students || students.length === 0) {
      return {
        generated: 0,
        skipped_on_leave: 0,
        skipped_existing: 0,
        skipped_no_subjects: 0,
        skipped_before_enrollment: 0,
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

    const { data: invoiceRows } = await supabase
      .from("invoices")
      .select("student_id, status, created_at")
      .eq("month", month)
      .eq("year", year)
      .in("student_id", studentIds)

    const invoicesByStudent = new Map<string, InvoiceStatusRow[]>()
    for (const row of invoiceRows ?? []) {
      const list = invoicesByStudent.get(row.student_id) ?? []
      list.push(row as InvoiceStatusRow)
      invoicesByStudent.set(row.student_id, list)
    }

    const dueDate = toDateString(year, month, lastDayOfMonth(year, month))

    let skippedOnLeave = 0
    let skippedExisting = 0
    let skippedNoSubjects = 0
    let skippedBeforeEnrollment = 0
    let skippedNotSelected = 0

    const invoicesWithLines: Array<{
      student_id: string
      month: number
      year: number
      amount: number
      status: "PENDING"
      due_date: string
      created_by: string | null
      school_level_at_billing: SchoolLevel
      payment_access_token: string
      lines: Array<{ subject: KumonSubject; label: string; unit_amount: number }>
    }> = []

    for (const student of students) {
      if (selectedStudentIds && !selectedStudentIds.has(student.id)) {
        skippedNotSelected++
        continue
      }

      if (onLeaveIds.has(student.id)) {
        skippedOnLeave++
        continue
      }

      const subjects = getStudentSubjects(student as { student_subjects?: StudentSubjectRow[] })

      if (isBillingPeriodBeforeEnrollment(student.enrolled_at, month, year)) {
        skippedBeforeEnrollment++
        continue
      }

      const billableSubjects = filterSubjectsForBillingPeriod(subjects, month, year)

      if (billableSubjects.length === 0) {
        skippedNoSubjects++
        continue
      }

      const invoiceStatus = getEffectiveInvoiceStatus(
        invoicesByStudent.get(student.id) ?? []
      )

      if (!studentMatchesGenerateCategories(invoiceStatus, allowedCategories)) {
        skippedExisting++
        continue
      }

      if (!canGenerateInvoiceForStudent({
        onLeave: false,
        hasSubjects: true,
        invoiceStatus,
      })) {
        skippedExisting++
        continue
      }

      const schoolLevel =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((student as any).school_level as SchoolLevel) ?? "ELEMENTARY"
      const subjectKeys = billableSubjects.map((s) => s.subject)
      const { lines, total } = computeInvoiceLineItems(schoolLevel, subjectKeys, feeConfig)

      invoicesWithLines.push({
        student_id: student.id,
        month,
        year,
        amount: total,
        status: "PENDING",
        due_date: dueDate,
        created_by: createdBy,
        school_level_at_billing: schoolLevel,
        payment_access_token: generatePaymentAccessToken(),
        lines,
      })
    }

    if (invoicesWithLines.length === 0) {
      return {
        generated: 0,
        skipped_on_leave: skippedOnLeave,
        skipped_existing: skippedExisting,
        skipped_no_subjects: skippedNoSubjects,
        skipped_before_enrollment: skippedBeforeEnrollment,
        skipped_not_selected: skippedNotSelected,
        invoice_ids: [],
        marked_overdue,
      }
    }

    const reminderDays = await loadReminderDays(supabase)

    // Insert each invoice + its line items + its reminders atomically (RPC = one transaction),
    // so a mid-flow failure can never leave an invoice without its line items or reminders.
    const invoiceIds: string[] = []
    for (const { lines, ...inv } of invoicesWithLines) {
      const { data: newId, error } = await supabase.rpc("create_invoice_with_lines", {
        p_invoice: {
          student_id: inv.student_id,
          month: inv.month,
          year: inv.year,
          amount: inv.amount,
          due_date: inv.due_date,
          created_by: inv.created_by,
          school_level_at_billing: inv.school_level_at_billing,
          payment_access_token: inv.payment_access_token,
        },
        p_lines: lines,
        p_reminder_days: reminderDays,
      })

      if (error) {
        // 23505 = unique_violation: an active invoice for this student/month/year already
        // exists (e.g. a concurrent run won the race). Skip rather than fail the whole batch.
        if (error.code === "23505") {
          skippedExisting++
          continue
        }
        throw Errors.INTERNAL(error.message)
      }

      if (newId) invoiceIds.push(newId as string)
    }

    return {
      generated: invoiceIds.length,
      skipped_on_leave: skippedOnLeave,
      skipped_existing: skippedExisting,
      skipped_no_subjects: skippedNoSubjects,
      skipped_before_enrollment: skippedBeforeEnrollment,
      skipped_not_selected: skippedNotSelected,
      invoice_ids: invoiceIds,
      payment_links_created: invoiceIds.length,
      payment_links_failed: 0,
      payment_link_failed_ids: [],
      marked_overdue,
    }
  },

  /** Cron flow: flip PENDING invoices past their due date to OVERDUE (date-driven). */
  async markOverdueByDueDate(today?: string): Promise<MarkOverdueResult> {
    const marked = await markOverdueInvoices(
      supabaseAdmin,
      today ?? todayInCenterTimezone()
    )
    return { marked }
  },

  async ensurePaymentAccessToken(invoiceId: string): Promise<string> {
    const { data: invoice } = await supabaseAdmin
      .from("invoices")
      .select("payment_access_token")
      .eq("id", invoiceId)
      .single()

    if (invoice?.payment_access_token) return invoice.payment_access_token

    const token = generatePaymentAccessToken()
    const { error } = await supabaseAdmin
      .from("invoices")
      .update({ payment_access_token: token })
      .eq("id", invoiceId)

    if (error) throw Errors.INTERNAL(`Failed to assign payment token: ${error.message}`)
    return token
  },

  async getPaymentLink(invoiceId: string): Promise<string> {
    const token = await paymentService.ensurePaymentAccessToken(invoiceId)
    return buildPaymentLink(token)
  },

  async createCheckout(invoiceId: string): Promise<{ paymentUrl: string }> {
    const paymentUrl = await paymentService.getPaymentLink(invoiceId)
    return { paymentUrl }
  },

  async backfillPaymentTokensForInvoices(
    invoiceIds: string[]
  ): Promise<CheckoutLinksResult> {
    let created = 0
    const failed_ids: string[] = []

    for (const id of invoiceIds) {
      try {
        await paymentService.ensurePaymentAccessToken(id)
        created++
      } catch (err) {
        console.error(`Failed to assign payment token for invoice ${id}:`, err)
        failed_ids.push(id)
      }
    }

    return { created, failed: failed_ids.length, failed_ids }
  },

  async findInvoiceByPaymentToken(token: string): Promise<Invoice | null> {
    const { data } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("payment_access_token", token)
      .maybeSingle()

    return data ? (data as Invoice) : null
  },

  async resolvePayPage(token: string): Promise<PayPageOutcome> {
    const invoice = await paymentService.findInvoiceByPaymentToken(token)
    if (!invoice) {
      return {
        kind: "message",
        title: "Link tidak ditemukan",
        body: "Link pembayaran tidak valid atau sudah tidak berlaku.",
      }
    }

    // Resolve the leave flag only for CANCELLED invoices (to distinguish cuti
    // from a manual cancel) and the student status only for payable invoices —
    // preserving the original conditional DB-call pattern.
    let hasLeaveForPeriod = false
    if (invoice.status === "CANCELLED") {
      const { count: leaveCount } = await supabaseAdmin
        .from("temporary_leaves")
        .select("*", { count: "exact", head: true })
        .eq("student_id", invoice.student_id)
        .eq("month", invoice.month)
        .eq("year", invoice.year)
      hasLeaveForPeriod = (leaveCount ?? 0) > 0
    }

    let studentStatus: string | undefined
    if (invoice.status === "PENDING" || invoice.status === "OVERDUE") {
      const { data: student } = await supabaseAdmin
        .from("students")
        .select("status")
        .eq("id", invoice.student_id)
        .single()
      studentStatus = student?.status as string | undefined
    }

    const access = evaluatePayPageAccess({
      invoiceStatus: invoice.status,
      hasLeaveForPeriod,
      studentStatus,
    })
    if (access.kind === "message") return access

    const redirectUrl = await paymentService.resolveMidtransCheckout(invoice.id)
    return { kind: "redirect", url: redirectUrl }
  },

  async resolveMidtransCheckout(invoiceId: string): Promise<string> {
    const { data: invoice, error } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single()

    if (error || !invoice) throw Errors.INVOICE_NOT_FOUND()

    const inv = invoice as Invoice
    if (inv.status !== "PENDING" && inv.status !== "OVERDUE") {
      throw Errors.BAD_REQUEST("Tagihan tidak dapat dibayar.")
    }

    if (await isMidtransCheckoutReusable(inv)) {
      return inv.midtrans_payment_url!
    }

    if (inv.midtrans_order_id) {
      const priorStatus = await getMidtransTransactionStatus(inv.midtrans_order_id)
      if (priorStatus?.transaction_status === "pending") {
        await invalidateMidtransOrder(inv.midtrans_order_id)
      }
    }

    const { paymentUrl } = await paymentService._createCheckout(invoiceId, supabaseAdmin)
    return paymentUrl
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

    const pageExpiryHours = getMidtransPageExpiryHours()

    const result = await withMidtransRetry(
      () =>
        snap.createTransaction({
          transaction_details: {
            order_id: orderId,
            gross_amount: invoice.amount,
          },
          customer_details: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            first_name: (invoice as any).students?.full_name ?? "Siswa",
          },
          page_expiry: {
            duration: pageExpiryHours,
            unit: "hours",
          },
          ...(lineItems.length > 0 ? { item_details: lineItems } : {}),
        }),
      `createTransaction for invoice ${invoiceId}`
    )

    const snapCreatedAt = new Date().toISOString()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invRow = invoice as any
    const orderIds = appendOrderId(invRow.midtrans_order_ids, orderId)

    await supabase
      .from("invoices")
      .update({
        midtrans_order_id: orderId,
        midtrans_payment_url: result.redirect_url,
        midtrans_order_ids: orderIds,
        midtrans_snap_created_at: snapCreatedAt,
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

  async regenerateInvoice(
    invoiceId: string
  ): Promise<{ paymentUrl: string; notified: boolean; notifyError?: string }> {
    const supabase = await createSupabaseServerClient()

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("*, students(school_level, enrolled_at, student_subjects(subject, enrolled_at))")
      .eq("id", invoiceId)
      .single()

    if (error || !invoice) throw Errors.INVOICE_NOT_FOUND()

    const inv = invoice as Invoice & {
      students: {
        school_level: SchoolLevel
        enrolled_at: string
        student_subjects: Array<{ subject: KumonSubject; enrolled_at: string }>
      }
    }

    if (inv.status !== "PENDING" && inv.status !== "OVERDUE") {
      throw Errors.BAD_REQUEST("Hanya tagihan belum lunas yang dapat dihitung ulang.")
    }

    const { fees: feeConfig } = await loadSubjectFeesForPeriod(
      supabase,
      inv.month,
      inv.year
    )

    const schoolLevel = inv.students?.school_level ?? "ELEMENTARY"
    const allSubjects = (inv.students?.student_subjects ?? []).map((ss) => ({
      subject: ss.subject,
      enrolled_at: ss.enrolled_at,
    }))
    const billableSubjects = filterSubjectsForBillingPeriod(
      allSubjects,
      inv.month,
      inv.year
    ).map((s) => s.subject)

    // No billable subjects -> an invoice must not exist for this period. Refuse the recalc
    // (leaving the current invoice untouched) instead of rewriting it to a 0-amount,
    // line-item-less, unpayable invoice.
    if (billableSubjects.length === 0) {
      throw Errors.BAD_REQUEST(
        "Tidak dapat menghitung ulang: siswa tidak memiliki mata pelajaran yang ditagih untuk periode ini."
      )
    }

    const { lines, total } = computeInvoiceLineItems(schoolLevel, billableSubjects, feeConfig)

    await invalidateMidtransOrder(inv.midtrans_order_id)

    // Replace line items + amount atomically so a failure can't leave the invoice with a
    // stale amount and no (or partial) line items.
    const { error: regenError } = await supabase.rpc("regenerate_invoice_lines", {
      p_invoice_id: invoiceId,
      p_amount: total,
      p_school_level: schoolLevel,
      p_lines: lines.map((l) => ({
        subject: l.subject,
        label: l.label,
        unit_amount: l.unit_amount,
      })),
    })
    if (regenError) throw Errors.INTERNAL(regenError.message)

    const paymentUrl = await paymentService.getPaymentLink(invoiceId)

    // Always re-notify the parent: the recalc changes the amount + invalidates the old pay
    // link, but their last WhatsApp still shows the previous amount. A send failure must not
    // fail the recalc itself (matches the webhook-confirmation pattern).
    let notified = false
    let notifyError: string | undefined
    try {
      const res = await paymentService.sendUpdatedInvoiceNotification(invoiceId)
      notified = res.ok
      notifyError = res.error
    } catch (err) {
      notifyError = String(err)
    }

    return { paymentUrl, notified, notifyError }
  },

  /**
   * Push the corrected amount + current pay link to the parent after a recalc.
   * Reuses the reminder template and records a SENT audit row. Never throws on a
   * send failure — the caller decides what to do with the result.
   */
  async sendUpdatedInvoiceNotification(
    invoiceId: string
  ): Promise<{ ok: boolean; error?: string }> {
    const { data: invRow } = await supabaseAdmin
      .from("invoices")
      .select(
        "*, invoice_line_items(*), students(full_name, school_level, status, contacts(id, student_id, full_name, relationship, whatsapp_number, is_primary, created_at, updated_at))"
      )
      .eq("id", invoiceId)
      .single()

    if (!invRow) return { ok: false, error: "Invoice not found" }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inv = invRow as any
    const invoice = inv as Invoice
    const student = inv.students

    if (!student) return { ok: false, error: "Student not found" }
    if (student.status === "INACTIVE") return { ok: false, error: "Student inactive" }
    if (invoice.status !== "PENDING" && invoice.status !== "OVERDUE") {
      return { ok: false, error: `Invoice ${invoice.status}` }
    }

    const contacts = (student.contacts ?? []) as Contact[]
    const primaryContact = contacts.find((c: Contact) => c.is_primary) ?? contacts[0]
    if (!primaryContact?.whatsapp_number) {
      return { ok: false, error: "No WhatsApp contact" }
    }

    let paymentUrl: string
    try {
      paymentUrl = await paymentService.getPaymentLink(invoiceId)
    } catch (err) {
      return { ok: false, error: `Failed to build payment link: ${String(err)}` }
    }

    const lineItems = inv.invoice_line_items ?? []

    const { data: maxRow } = await supabaseAdmin
      .from("payment_reminders")
      .select("reminder_number")
      .eq("invoice_id", invoiceId)
      .order("reminder_number", { ascending: false })
      .limit(1)
    const nextNumber = (maxRow?.[0]?.reminder_number ?? 0) + 1

    const sendResult = await messagingService.sendPaymentReminder(
      invoice,
      primaryContact,
      paymentUrl,
      lineItems,
      paymentWhatsAppContext(student, invoice)
    )

    if (!sendResult.success) {
      return { ok: false, error: sendResult.error ?? "WhatsApp send failed" }
    }

    await supabaseAdmin.from("payment_reminders").insert({
      invoice_id: invoiceId,
      student_id: invoice.student_id,
      reminder_number: nextNumber,
      scheduled_date: todayInCenterTimezone(),
      status: "SENT" as const,
      sent_at: new Date().toISOString(),
      whatsapp_number: primaryContact.whatsapp_number,
      message_preview: "[admin] Tagihan diperbarui — jumlah & link baru",
    })

    return { ok: true }
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

    const today = todayInCenterTimezone()

    if (reminderId) {
      const { data: r } = await supabaseAdmin
        .from("payment_reminders")
        .select("*")
        .eq("id", reminderId)
        .eq("invoice_id", invoiceId)
        .single()
      targetReminder = (r as PaymentReminder) ?? null
      if (
        targetReminder &&
        targetReminder.scheduled_date > today &&
        targetReminder.status !== "SENT"
      ) {
        return { ok: false, error: "Pengingat ini belum jatuh tempo" }
      }
    } else {
      // Scheduled path (cron + manual "Kirim WA sekarang"): pick the HIGHEST-number due reminder —
      // the most recent slot the parent should hear about — and supersede earlier due ones below,
      // so a reminder stranded in the past (mid-month enrollment, cuti rebill) is never resurrected
      // or mislabeled. The bulk link-send path (ignoreSchedule) keeps its original lowest-first,
      // no-supersede behavior so it doesn't cancel still-scheduled reminders.
      let q = supabaseAdmin
        .from("payment_reminders")
        .select("*")
        .eq("invoice_id", invoiceId)
        .in("status", ["PENDING", "FAILED"])
      if (!ignoreSchedule) q = q.lte("scheduled_date", today)
      const { data: rows } = await q
      targetReminder = selectDueReminder((rows ?? []) as PaymentReminder[], {
        ignoreSchedule,
      })

      // Cancel older due reminders so they can't fire later (a subsequent cron slot or manual send)
      // or be sent out of order. Mirrors ensureOverdueCatchUpReminder's stale-row cancellation.
      if (targetReminder && !ignoreSchedule) {
        await supabaseAdmin
          .from("payment_reminders")
          .update({ status: "CANCELLED", message_preview: "Digantikan pengingat terbaru" })
          .eq("invoice_id", invoiceId)
          .in("status", ["PENDING", "FAILED"])
          .lte("scheduled_date", today)
          .lt("reminder_number", targetReminder.reminder_number)
      }
    }

    if (!targetReminder && ignoreSchedule) {
      const { month: currentMonth, year: currentYear } = monthYearFromDateString(today)
      const chaseableUnpaid = isOverdueChaseEligible({
        status: invoice.status,
        month: invoice.month,
        year: invoice.year,
        currentMonth,
        currentYear,
      })
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
      return { ok: false, error: "Tidak ada pengingat yang sudah jatuh tempo untuk dikirim" }
    }

    let paymentUrl: string
    try {
      paymentUrl = await paymentService.getPaymentLink(invoiceId)
    } catch (err) {
      const msg = `Failed to build payment link: ${String(err)}`
      await paymentService._markReminderFailed(targetReminder.id, msg)
      return { ok: false, reminderId: targetReminder.id, error: msg }
    }

    const lineItems = inv.invoice_line_items ?? []
    const sendResult = await messagingService.sendPaymentReminder(
      invoice,
      primaryContact,
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
   * Designed for a ten-slot morning schedule on reminder days (1/11/21):
   *   Slots 1-9 (09:00–13:00 WIB): Phase 1 only — current-month scheduled reminders
   *   Slot 10 (13:30 WIB): Phase 1 + Phase 2 — plus overdue/prior-month chase
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
      slot?: number
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
          outcome.error?.startsWith("Invoice already") ||
          outcome.error === "Student inactive" ||
          outcome.error === "Tidak ada pengingat yang sudah jatuh tempo untuk dikirim"
        if (skip) result.skipped++
        else result.failed++
      }
    }

    // Phase 1: every invoice with a due, not-yet-sent reminder. Using `scheduled_date <= today`
    // (not `=== today`) catches reminders whose scheduled day passed before the invoice existed
    // (mid-month enrollment, manual generation, cuti rebill). FAILED rows are limited to today so a
    // transient failure retries on the next slot (same-day retry) without endlessly re-hitting an
    // ancient permanently-failing number. Per invoice we send only the latest due reminder and
    // supersede the rest, so each invoice gets at most one send per run; the processedInvoiceIds
    // set then keeps Phase 2 from touching the same invoice.
    const { data: dueReminders, error } = await supabaseAdmin
      .from("payment_reminders")
      .select("invoice_id")
      .or(
        `and(status.eq.PENDING,scheduled_date.lte.${today}),and(status.eq.FAILED,scheduled_date.eq.${today})`
      )

    if (error) throw Errors.INTERNAL(error.message)

    const dueInvoiceIds = Array.from(
      new Set((dueReminders ?? []).map((r) => r.invoice_id as string))
    )

    for (const invoiceId of dueInvoiceIds) {
      if (result.processed >= batchLimit) {
        result.truncated = true
        return result
      }
      result.processed++
      processedInvoiceIds.add(invoiceId)
      const outcome = await paymentService.sendPaymentReminderForInvoice(invoiceId, {
        initiatedBy: "cron",
      })
      recordOutcome(outcome)
      if (result.processed < batchLimit) await sleep(delayMs)
    }

    // Phase 2: prior-month OVERDUE invoices on each global reminder day (1 / 11 / 21)
    if (!includeOverdueChase || !isReminderDay(today, reminderDays)) {
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
      if (
        !isOverdueChaseEligible({
          status: inv.status,
          month: inv.month,
          year: inv.year,
          currentMonth,
          currentYear,
        })
      ) {
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

  async listPaymentLinkSendCandidates(
    month: number,
    year: number
  ): Promise<PaymentLinkSendCandidatesResult> {
    const { data: rows, error } = await supabaseAdmin
      .from("invoices")
      .select(
        "id, status, payment_access_token, students(full_name, status, contacts(whatsapp_number, is_primary)), payment_reminders(status)"
      )
      .eq("month", month)
      .eq("year", year)
      .in("status", ["PENDING", "OVERDUE"])

    if (error) throw Errors.INTERNAL(error.message)

    const SENDABLE: WhatsAppDeliveryStatus[] = [
      "link_not_sent",
      "send_failed",
      "partial_failed",
    ]

    let eligible = 0
    let already_sent = 0
    let no_whatsapp = 0
    let no_link = 0
    const candidates: PaymentLinkSendCandidatesResult["candidates"] = []

    for (const row of rows ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inv = row as any
      const student = inv.students
      const reminders = (inv.payment_reminders ?? []) as PaymentReminder[]

      if (!inv.payment_access_token) {
        no_link++
        continue
      }

      const waStatus = getWhatsAppDeliveryStatus(inv as Invoice, reminders)
      if (waStatus === "sent") {
        already_sent++
        continue
      }

      const contacts = (student?.contacts ?? []) as Contact[]
      const primaryContact =
        contacts.find((c: Contact) => c.is_primary) ?? contacts[0]
      if (!primaryContact?.whatsapp_number) {
        no_whatsapp++
        continue
      }

      const studentStatus = student?.status as string | undefined
      if (
        !studentStatus ||
        !(BILLABLE_STUDENT_STATUSES as readonly string[]).includes(studentStatus)
      ) {
        continue
      }

      if (!SENDABLE.includes(waStatus)) continue

      eligible++
      candidates.push({
        invoice_id: inv.id as string,
        student_name: (student?.full_name as string) ?? "—",
      })
    }

    candidates.sort((a, b) => a.student_name.localeCompare(b.student_name, "id"))

    return {
      month,
      year,
      eligible,
      already_sent,
      no_whatsapp,
      no_link,
      candidates,
    }
  },

  /**
   * Manually send payment links via WhatsApp for all eligible invoices in a period.
   * Reuses the same per-invoice logic as the reminder cron (`sendPaymentReminderForInvoice`).
   */
  async sendPaymentLinksForPeriod(
    month: number,
    year: number,
    options?: { batchLimit?: number; delayMs?: number }
  ): Promise<SendPaymentLinksResult> {
    const batchLimit =
      options?.batchLimit ?? Number(process.env.WHATSAPP_BATCH_LIMIT ?? 100)
    const delayMs =
      options?.delayMs ?? Number(process.env.WHATSAPP_SEND_DELAY_MS ?? 2000)

    const { candidates } = await paymentService.listPaymentLinkSendCandidates(
      month,
      year
    )

    const result: SendPaymentLinksResult = {
      month,
      year,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      truncated: false,
    }

    const recordOutcome = (outcome: { ok: boolean; error?: string }) => {
      if (outcome.ok) {
        result.sent++
      } else {
        const skip =
          outcome.error?.startsWith("Invoice already") ||
          outcome.error === "Student inactive" ||
          outcome.error === "Tidak ada pengingat yang sudah jatuh tempo untuk dikirim"
        if (skip) result.skipped++
        else result.failed++
      }
    }

    for (const candidate of candidates) {
      if (result.processed >= batchLimit) {
        result.truncated = true
        break
      }

      result.processed++
      const outcome = await paymentService.sendPaymentReminderForInvoice(
        candidate.invoice_id,
        { ignoreSchedule: true, initiatedBy: "admin" }
      )
      recordOutcome(outcome)
      if (result.processed < batchLimit && result.processed < candidates.length) {
        await sleep(delayMs)
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

  /** Mark a reminder row as manually sent without going through the messaging provider. */
  async markReminderSentManually(
    reminderId: string,
    note?: string
  ): Promise<{ ok: boolean; error?: string }> {
    const { data: reminder } = await supabaseAdmin
      .from("payment_reminders")
      .select("scheduled_date, status")
      .eq("id", reminderId)
      .single()

    if (!reminder) return { ok: false, error: "Pengingat tidak ditemukan" }

    const today = todayInCenterTimezone()
    if (reminder.scheduled_date > today && reminder.status !== "SENT") {
      return { ok: false, error: "Pengingat ini belum jatuh tempo" }
    }

    const label = note ? `Manual: ${note}` : "Manual: terkirim oleh admin"
    await supabaseAdmin
      .from("payment_reminders")
      .update({
        status: "SENT",
        sent_at: new Date().toISOString(),
        message_preview: label.slice(0, 200),
      })
      .eq("id", reminderId)
    return { ok: true }
  },

  /** Build the WA reminder message text for copy-paste without sending. */
  async getReminderMessagePreview(
    invoiceId: string
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
      paymentUrl = await paymentService.getPaymentLink(invoiceId)
    } catch {
      return null
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
    if (!isValidMidtransSettlement(payload.transaction_status, payload.fraud_status)) {
      return { handled: false, sendConfirmation: false }
    }

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

      if (!isValidMidtransSettlement(status.transaction_status, status.fraud_status)) {
        continue
      }

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

  /** Assign payment_access_token for unpaid invoices missing one (cron backfill). */
  async backfillMissingPaymentLinks(options?: {
    month?: number
    year?: number
    batchLimit?: number
  }): Promise<BackfillLinksResult> {
    const batchLimit =
      options?.batchLimit ?? Number(process.env.MIDTRANS_BACKFILL_BATCH_LIMIT ?? 50)

    let query = supabaseAdmin
      .from("invoices")
      .select("id")
      .in("status", ["PENDING", "OVERDUE"])
      .is("payment_access_token", null)
      .order("created_at", { ascending: true })
      .limit(batchLimit)

    if (options?.month != null) query = query.eq("month", options.month)
    if (options?.year != null) query = query.eq("year", options.year)

    const { data: invoices, error } = await query
    assertSupabaseOk(error, "invoices query")

    const invoiceIds = (invoices ?? []).map((row) => row.id)
    const linkResult = await paymentService.backfillPaymentTokensForInvoices(invoiceIds)

    const defaults = currentMonthYearInCenterTimezone()
    return {
      attempted: invoiceIds.length,
      month: options?.month ?? defaults.month,
      year: options?.year ?? defaults.year,
      ...linkResult,
    }
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

    // Atomic guard: only an unpaid invoice can be marked paid. The status filter
    // lives in the UPDATE itself so a concurrent transition cannot slip a final
    // invoice (CANCELLED/WAIVED/PAID) back to PAID via a check-then-write race.
    const { data, error } = await supabase
      .from("invoices")
      .update({ status: "PAID", paid_at: new Date().toISOString() })
      .eq("id", invoiceId)
      // Only an unpaid invoice can be marked paid. PAID_OLD_LINK is intentionally
      // excluded: that reconciliation goes through the settlement/reconcile path,
      // and flipping it to PAID here can collide with the active-invoice unique
      // index when a regenerated invoice exists for the same period.
      .in("status", ["PENDING", "OVERDUE"])
      .select()
      .single()

    if (error || !data) {
      await assertInvoiceTransitionFailure(
        supabase,
        invoiceId,
        "Hanya tagihan belum lunas yang dapat ditandai lunas."
      )
    }

    await cancelPendingReminders(invoiceId, "Tagihan sudah lunas", supabase)

    return data as Invoice
  },

  async waive(invoiceId: string, notes: string): Promise<Invoice> {
    const supabase = await createSupabaseServerClient()

    // Atomic guard: a paid/cancelled invoice must not be waived. Filtering on
    // the current status inside the UPDATE keeps the transition race-free.
    const { data, error } = await supabase
      .from("invoices")
      .update({ status: "WAIVED", notes })
      .eq("id", invoiceId)
      .in("status", ["PENDING", "OVERDUE"])
      .select()
      .single()

    if (error || !data) {
      await assertInvoiceTransitionFailure(
        supabase,
        invoiceId,
        "Hanya tagihan belum lunas yang dapat dibebaskan."
      )
    }

    await cancelPendingReminders(invoiceId, "Tagihan dibebaskan", supabase)

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

    // Atomic guard: the status may have changed (e.g. webhook settlement to
    // PAID) between the read above and this write — filtering on unpaid status
    // inside the UPDATE keeps the transition race-free, like markPaid/waive.
    const { data, error } = await supabase
      .from("invoices")
      .update({
        status: "CANCELLED",
        midtrans_payment_url: null,
        midtrans_snap_created_at: null,
      })
      .eq("id", invoiceId)
      .in("status", ["PENDING", "OVERDUE"])
      .select()
      .single()

    if (error || !data) {
      await assertInvoiceTransitionFailure(
        supabase,
        invoiceId,
        "Hanya tagihan belum lunas yang dapat dibatalkan."
      )
    }

    await cancelPendingReminders(invoiceId, "Tagihan dibatalkan", supabase)

    return data as Invoice
  },

  /**
   * Cancels PENDING/OVERDUE invoices for the given students' leave month.
   * Called from the leave actions when the admin opts in (default-on checkbox).
   * Per-invoice failures (e.g. paid in the race window, Midtrans error) are
   * collected instead of failing the batch — those stay live for manual action.
   */
  async cancelUnpaidInvoicesForLeave(
    studentIds: string[],
    month: number,
    year: number
  ): Promise<LeaveInvoiceCancelResult> {
    const supabase = await createSupabaseServerClient()

    const { data: rows, error } = await supabase
      .from("invoices")
      .select("id, student_id, amount, status, students(full_name)")
      .in("student_id", studentIds)
      .eq("month", month)
      .eq("year", year)
      .in("status", ["PENDING", "OVERDUE"])

    if (error) throw Errors.INTERNAL(error.message)

    const targets: LeaveMonthInvoice[] = (rows ?? []).map((row) => ({
      invoice_id: row.id,
      student_id: row.student_id,
      student_name:
        (row.students as unknown as { full_name: string } | null)?.full_name ?? "",
      amount: row.amount,
      status: row.status as LeaveMonthInvoice["status"],
    }))

    const cancelled: LeaveMonthInvoice[] = []
    const failed: LeaveMonthInvoice[] = []
    for (const target of targets) {
      try {
        await paymentService.cancel(target.invoice_id)
        cancelled.push(target)
      } catch (err) {
        console.error(
          `cancelUnpaidInvoicesForLeave: failed to cancel invoice ${target.invoice_id}`,
          err
        )
        failed.push(target)
      }
    }

    return { cancelled, failed }
  },

  /** Current status for a set of invoice ids — reconciles race windows in bulk flows. */
  async getInvoiceStatusesByIds(
    invoiceIds: string[]
  ): Promise<Array<{ invoice_id: string; status: PaymentStatus }>> {
    if (invoiceIds.length === 0) return []
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
      .from("invoices")
      .select("id, status")
      .in("id", invoiceIds)

    if (error) throw Errors.INTERNAL(error.message)

    return (data ?? []).map((row) => ({
      invoice_id: row.id,
      status: row.status as PaymentStatus,
    }))
  },

  /**
   * PAID invoices whose (student, month, year) also has a temporary_leaves row —
   * the parent paid before cuti was recorded, so the admin needs to decide on a
   * refund/credit. All-time: a conflict persists on the dashboard until the
   * admin marks it handled ("Tandai selesai", persisted per invoice in
   * paid_leave_conflict_resolutions) or the cuti is cancelled.
   */
  async listPaidLeaveConflicts(): Promise<PaidLeaveConflict[]> {
    const supabase = await createSupabaseServerClient()

    const { data: leaves, error: leavesError } = await supabase
      .from("temporary_leaves")
      .select("student_id, month, year")

    if (leavesError) throw Errors.INTERNAL(leavesError.message)
    if (!leaves || leaves.length === 0) return []

    const leaveKeys = new Set(leaves.map((l) => `${l.student_id}:${l.month}:${l.year}`))
    const studentIds = [...new Set(leaves.map((l) => l.student_id))]

    const { data: invoices, error: invoicesError } = await supabase
      .from("invoices")
      .select("id, student_id, month, year, amount, students(full_name)")
      .eq("status", "PAID")
      .in("student_id", studentIds)

    if (invoicesError) throw Errors.INTERNAL(invoicesError.message)

    const conflicts = (invoices ?? []).filter((inv) =>
      leaveKeys.has(`${inv.student_id}:${inv.month}:${inv.year}`)
    )
    if (conflicts.length === 0) return []

    const { data: resolutions, error: resolutionsError } = await supabase
      .from("paid_leave_conflict_resolutions")
      .select("invoice_id")
      .in(
        "invoice_id",
        conflicts.map((inv) => inv.id)
      )

    if (resolutionsError) throw Errors.INTERNAL(resolutionsError.message)

    const resolvedIds = new Set((resolutions ?? []).map((r) => r.invoice_id))

    return conflicts
      .filter((inv) => !resolvedIds.has(inv.id))
      .map((inv) => ({
        invoice_id: inv.id,
        student_id: inv.student_id,
        student_name:
          (inv.students as unknown as { full_name: string } | null)?.full_name ?? "",
        month: inv.month,
        year: inv.year,
        amount: inv.amount,
      }))
      .sort(
        (a, b) =>
          b.year - a.year ||
          b.month - a.month ||
          a.student_name.localeCompare(b.student_name)
      )
  },

  /**
   * Marks a paid-leave conflict handled (refund/credit decided). Idempotent:
   * re-resolving an already-resolved invoice succeeds without a second row.
   */
  async resolvePaidLeaveConflict(invoiceId: string, note?: string): Promise<void> {
    const supabase = await createSupabaseServerClient()

    const { data: invoice, error: fetchError } = await supabase
      .from("invoices")
      .select("id, status")
      .eq("id", invoiceId)
      .single()

    if (fetchError || !invoice) throw Errors.INVOICE_NOT_FOUND()
    if (invoice.status !== "PAID") {
      throw Errors.BAD_REQUEST("Hanya tagihan lunas yang dapat ditandai selesai.")
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase.from("paid_leave_conflict_resolutions").insert({
      invoice_id: invoiceId,
      note: note ?? null,
      created_by: user?.id ?? null,
    })

    // 23505 = already resolved (unique invoice_id) — treat as success.
    if (error && error.code !== "23505") throw Errors.INTERNAL(error.message)
  },
}
