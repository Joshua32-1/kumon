// Admin failure alerts. Pure message formatters (unit-tested) plus the single
// side-effecting send. Used by the billing watchdog and singleton-cron catch
// blocks to email the admin only when something is genuinely broken.
import { sendEmail, type SendEmailResult } from "@/lib/email/client"
import { AppError } from "@/lib/errors"
import { getMonthName } from "@/lib/utils"

/**
 * True when an error is a genuine cron failure worth paging on — an unexpected throw
 * or a 5xx AppError — rather than benign 4xx control flow (e.g. OUTSIDE_PROMOTION_WINDOW,
 * BAD_REQUEST), which is expected and should not alert.
 */
export function isAlertWorthyError(err: unknown): boolean {
  if (err instanceof AppError) return err.statusCode >= 500
  return true
}

export interface MissingInvoiceStudent {
  id: string
  name: string
}

export interface AlertMessage {
  subject: string
  body: string
}

/** Pure: subject + body for the billing-watchdog "missing invoices" alert. */
export function formatMissingInvoicesAlert(input: {
  month: number
  year: number
  missing: MissingInvoiceStudent[]
}): AlertMessage {
  const period = `${getMonthName(input.month)} ${input.year}`
  const subject = `[Kumon] ${input.missing.length} siswa belum punya tagihan ${period}`
  const lines = input.missing.map((s) => `- ${s.name} (${s.id})`).join("\n")
  const body =
    `Watchdog tagihan menemukan ${input.missing.length} siswa aktif yang belum memiliki tagihan untuk ${period}:\n\n` +
    `${lines}\n\n` +
    `Periksa cron generate-invoices (kemungkinan gagal atau dinonaktifkan), lalu jalankan ulang generate-invoices.`
  return { subject, body }
}

/** Pure: subject + body for a singleton-cron failure alert. */
export function formatCronFailureAlert(input: {
  job: string
  error: string
}): AlertMessage {
  const subject = `[Kumon] Cron gagal: ${input.job}`
  const body =
    `Cron "${input.job}" gagal dijalankan.\n\n` +
    `Error:\n${input.error}\n\n` +
    `Tidak ada percobaan ulang otomatis untuk job ini — periksa dan jalankan ulang secara manual bila perlu.`
  return { subject, body }
}

/** Side-effecting: email the admin. Recipient from ALERT_EMAIL_TO. */
export async function sendAdminAlert(message: AlertMessage): Promise<SendEmailResult> {
  const to = process.env.ALERT_EMAIL_TO
  if (!to) {
    console.warn("[alerts] ALERT_EMAIL_TO not set — admin alert not sent:", message.subject)
    return { sent: false, skipped: true }
  }
  return sendEmail({ to, subject: message.subject, text: message.body })
}

/**
 * Alert the admin when a cron handler fails for a genuine reason (5xx AppError or an
 * unexpected throw). No-op for benign 4xx control flow. Single entry point so every
 * cron catch block reports failures the same way.
 */
export async function alertCronFailure(job: string, err: unknown): Promise<void> {
  if (!isAlertWorthyError(err)) return
  const message = err instanceof AppError ? err.message : String(err)
  await sendAdminAlert(formatCronFailureAlert({ job, error: message }))
}
