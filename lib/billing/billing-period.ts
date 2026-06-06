import { currentMonthYearInCenterTimezone, isPriorBillingPeriod, monthYearFromDateString } from "@/lib/utils"
import type { KumonSubject } from "@/lib/billing/fees"

export function billingPeriodIndex(month: number, year: number): number {
  return year * 12 + month
}

/** True when billing month/year is strictly before the calendar month of enrolled_at. */
export function isBillingPeriodBeforeEnrollment(
  enrolledAt: string,
  billingMonth: number,
  billingYear: number
): boolean {
  const { month: enrollMonth, year: enrollYear } = monthYearFromDateString(enrolledAt)
  return (
    billingPeriodIndex(billingMonth, billingYear) <
    billingPeriodIndex(enrollMonth, enrollYear)
  )
}

export function isPastBillingPeriod(
  billingMonth: number,
  billingYear: number,
  now = new Date()
): boolean {
  const { month: currentMonth, year: currentYear } = currentMonthYearInCenterTimezone(now)
  return isPriorBillingPeriod(billingMonth, billingYear, currentMonth, currentYear)
}

export function filterSubjectsForBillingPeriod<
  T extends { subject: KumonSubject; enrolled_at: string },
>(subjects: T[], billingMonth: number, billingYear: number): T[] {
  return subjects.filter(
    (s) => !isBillingPeriodBeforeEnrollment(s.enrolled_at, billingMonth, billingYear)
  )
}
