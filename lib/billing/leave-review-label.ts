import { getMonthName } from "@/lib/utils"
import type { LeaveReviewAlert, LeaveReviewStudent } from "@/features/students/types"

export function formatLeaveStreakPeriod(
  startMonth: number,
  startYear: number,
  endMonth: number,
  endYear: number
): string {
  const start = `${getMonthName(startMonth)} ${startYear}`
  const end = `${getMonthName(endMonth)} ${endYear}`
  if (startMonth === endMonth && startYear === endYear) return start
  return `${start} – ${end}`
}

export function leaveReviewSummary(
  alert: LeaveReviewAlert | LeaveReviewStudent
): string {
  const period = formatLeaveStreakPeriod(
    alert.period_start_month,
    alert.period_start_year,
    alert.period_end_month,
    alert.period_end_year
  )
  return `${alert.consecutive_months} bulan cuti berturut-turut (${period})`
}
