import { Badge } from "@/components/ui/badge"
import { leaveReviewSummary } from "@/lib/billing/leave-review-label"
import type { LeaveReviewAlert } from "../types"

interface LeaveReviewBadgeProps {
  alert: Pick<
    LeaveReviewAlert,
    | "consecutive_months"
    | "max_consecutive_months"
    | "period_start_month"
    | "period_start_year"
    | "period_end_month"
    | "period_end_year"
  >
  className?: string
}

export function LeaveReviewBadge({ alert, className }: LeaveReviewBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={`border-[var(--warning-border)] bg-[var(--warning-muted)] text-[var(--warning-foreground)] ${className ?? ""}`}
      title={leaveReviewSummary(alert)}
    >
      Cuti {alert.consecutive_months}+ bln
    </Badge>
  )
}
