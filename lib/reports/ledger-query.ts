import type { PaymentStatus } from "@/features/payments/types"
import { currentMonthYearInCenterTimezone } from "@/lib/utils"

// Pure validation/normalization for the payment-ledger + CSV-export query params,
// shared by both routes.

const PAYMENT_STATUSES: PaymentStatus[] = [
  "PENDING",
  "PAID",
  "OVERDUE",
  "CANCELLED",
  "WAIVED",
  "PAID_OLD_LINK",
]

export function isPaymentStatus(value: string): value is PaymentStatus {
  return (PAYMENT_STATUSES as string[]).includes(value)
}

export interface LedgerParams {
  year: number
  status?: PaymentStatus
}

export type LedgerParamResult =
  | { ok: true; params: LedgerParams }
  | { ok: false; message: string }

/** Year defaults to the current WIB year; status is optional but must be valid. */
export function parseLedgerParams(
  searchParams: URLSearchParams,
  now = new Date()
): LedgerParamResult {
  const yearParam = searchParams.get("year")
  const year = yearParam ? Number(yearParam) : currentMonthYearInCenterTimezone(now).year
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return { ok: false, message: "Tahun tidak valid" }
  }

  const statusParam = searchParams.get("status")
  if (statusParam && !isPaymentStatus(statusParam)) {
    return { ok: false, message: "Status tidak valid" }
  }

  return {
    ok: true,
    params: { year, status: statusParam ? (statusParam as PaymentStatus) : undefined },
  }
}
