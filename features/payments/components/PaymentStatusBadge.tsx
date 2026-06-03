import { StatusBadge } from "@/components/shared/StatusBadge"
import type { PaymentStatus } from "../types"

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <StatusBadge status={status} />
}
