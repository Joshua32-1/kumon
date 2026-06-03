import { StatusBadge } from "@/components/shared/StatusBadge"
import type { StudentStatus } from "../types"

export function StudentStatusBadge({ status }: { status: StudentStatus }) {
  return <StatusBadge status={status} />
}
