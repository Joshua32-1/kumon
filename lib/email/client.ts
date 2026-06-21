// Resend transactional email client (server-side only).
// Lazy + no-op when unconfigured so local dev and cron runs without
// RESEND_API_KEY (or ALERT_EMAIL_FROM) never crash — they just skip the send.
import { Resend } from "resend"

let _resend: Resend | null = null

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  if (!_resend) _resend = new Resend(apiKey)
  return _resend
}

export interface SendEmailInput {
  to: string
  subject: string
  text: string
}

export interface SendEmailResult {
  sent: boolean
  /** True when no provider was configured, so nothing was attempted. */
  skipped?: boolean
  error?: string
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const resend = getResend()
  const from = process.env.ALERT_EMAIL_FROM
  if (!resend || !from) {
    console.warn("[email] RESEND_API_KEY or ALERT_EMAIL_FROM not set — email not sent")
    return { sent: false, skipped: true }
  }
  try {
    const { error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    })
    if (error) {
      console.error("[email] Resend send failed:", error)
      return { sent: false, error: error.message ?? String(error) }
    }
    return { sent: true }
  } catch (err) {
    console.error("[email] Resend send threw:", err)
    return { sent: false, error: String(err) }
  }
}
