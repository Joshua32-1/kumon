/**
 * Segment config holder for /payments. The page itself is a client component, so it
 * cannot export route config; this layout carries it for the segment (page render and
 * the Server Actions it invokes, notably `sendPaymentLinksAction`).
 *
 * 300s is the Vercel Hobby ceiling, matching the send-reminders cron route.
 * `sendPaymentLinksForPeriod` stops itself at PAYMENT_LINK_RUN_BUDGET_MS so it returns
 * `truncated: true` instead of being killed mid-loop with its counts lost. It also
 * applies to /payments/[id]; that is a ceiling, not a reservation, and nothing on either
 * page loops without its own bound.
 */
export const maxDuration = 300

export default function PaymentsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
