import type { Invoice } from "@/features/payments/types"

export interface ArrearsPeriod {
  month: number
  year: number
  count: number
  totalAmount: number
  invoiceIds: string[]
}

export interface ArrearsSummary {
  count: number
  totalAmount: number
  byPeriod: ArrearsPeriod[]
  oldest: ArrearsPeriod | null
}

/**
 * An invoice is "in arrears" when it is unpaid and either:
 * - status is OVERDUE (cron has already marked it), or
 * - status is PENDING but due_date has passed (edge case before cron runs)
 */
export function isArrearsInvoice(
  inv: Pick<Invoice, "status" | "due_date">,
  today: string
): boolean {
  if (inv.status === "OVERDUE") return true
  if (inv.status === "PENDING" && inv.due_date < today) return true
  return false
}

/** Group arrears invoices by billing period (month/year), sorted oldest first. */
export function groupArrearsByPeriod(invoices: Invoice[], today: string): ArrearsPeriod[] {
  const map = new Map<string, ArrearsPeriod>()

  for (const inv of invoices) {
    if (!isArrearsInvoice(inv, today)) continue
    const key = `${inv.year}-${String(inv.month).padStart(2, "0")}`
    const entry = map.get(key) ?? { month: inv.month, year: inv.year, count: 0, totalAmount: 0, invoiceIds: [] }
    entry.count++
    entry.totalAmount += inv.amount
    entry.invoiceIds.push(inv.id)
    map.set(key, entry)
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year
    return a.month - b.month
  })
}

/** Summarize all arrears invoices into a single object for dashboard/profile use. */
export function summarizeArrears(invoices: Invoice[], today: string): ArrearsSummary {
  const byPeriod = groupArrearsByPeriod(invoices, today)
  const count = byPeriod.reduce((s, p) => s + p.count, 0)
  const totalAmount = byPeriod.reduce((s, p) => s + p.totalAmount, 0)
  return {
    count,
    totalAmount,
    byPeriod,
    oldest: byPeriod[0] ?? null,
  }
}
