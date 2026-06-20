import type { Invoice } from "@/features/payments/types"
import { isArrearsInvoice } from "@/lib/billing/arrears"

// Pure arrears-aging aggregation: bucket overdue invoices by how long they have
// been past due (WIB calendar days). Read-only over the invoices already loaded
// by the reports service; reuses the same arrears predicate as the dashboard.

export type AgingBucketKey = "0-30" | "31-60" | "61-90" | "90+"

export interface AgingBucket {
  key: AgingBucketKey
  label: string
  count: number
  totalAmount: number
}

export interface ArrearsAgingSummary {
  buckets: AgingBucket[]
  count: number
  totalAmount: number
}

/** Row shape needed for aging — a subset of Invoice. */
export type ArrearsAgingRow = Pick<Invoice, "status" | "due_date" | "amount">

const BUCKET_LABELS: Record<AgingBucketKey, string> = {
  "0-30": "0–30 hari",
  "31-60": "31–60 hari",
  "61-90": "61–90 hari",
  "90+": "90+ hari",
}

const BUCKET_ORDER: AgingBucketKey[] = ["0-30", "31-60", "61-90", "90+"]

/** Midnight-UTC epoch ms of a YYYY-MM-DD calendar date (TZ-drift-free). */
function isoDateToUtcMs(iso: string): number {
  return Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10))
  )
}

/** Whole days `today` is past `dueDate` (both WIB calendar dates, YYYY-MM-DD). */
export function daysOverdue(dueDate: string, today: string): number {
  return Math.round((isoDateToUtcMs(today) - isoDateToUtcMs(dueDate)) / 86_400_000)
}

export function agingBucketForDays(days: number): AgingBucketKey {
  if (days <= 30) return "0-30"
  if (days <= 60) return "31-60"
  if (days <= 90) return "61-90"
  return "90+"
}

export function buildArrearsAging(
  invoices: ArrearsAgingRow[],
  today: string
): ArrearsAgingSummary {
  const byKey = new Map<AgingBucketKey, AgingBucket>(
    BUCKET_ORDER.map((key) => [key, { key, label: BUCKET_LABELS[key], count: 0, totalAmount: 0 }])
  )

  let count = 0
  let totalAmount = 0
  for (const inv of invoices) {
    if (!isArrearsInvoice(inv, today)) continue
    const days = daysOverdue(inv.due_date, today)
    const bucket = byKey.get(agingBucketForDays(days))!
    bucket.count++
    bucket.totalAmount += inv.amount
    count++
    totalAmount += inv.amount
  }

  return { buckets: BUCKET_ORDER.map((key) => byKey.get(key)!), count, totalAmount }
}
