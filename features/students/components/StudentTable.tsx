"use client"

import { useRouter } from "next/navigation"
import { DataTable, type Column } from "@/components/shared/DataTable"
import { StudentStatusBadge } from "./StudentStatusBadge"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { PaymentStatusBadge } from "@/features/payments/components/PaymentStatusBadge"
import { formatDate } from "@/lib/utils"
import { SCHOOL_LEVEL_LABELS } from "@/lib/billing/fees"
import { GRADE_LABELS } from "@/lib/billing/grades"
import type { StudentGrade } from "@/lib/billing/grades"
import { LeaveReviewBadge } from "./LeaveReviewBadge"
import type { Student, LeaveReviewStudent } from "../types"
import type { BillingSummary } from "@/features/payments/billing-summary"
import type { PaymentStatus } from "@/features/payments/types"

export interface StudentBillingEntry {
  paymentStatus: PaymentStatus | null
  whatsappStatus: BillingSummary["whatsappStatus"]
  attention: BillingSummary["attention"]
  attentionReason: BillingSummary["attentionReason"]
  onLeave: boolean
}

function makeColumns(
  billingMap: Map<string, StudentBillingEntry>,
  leaveReviewMap: Map<string, LeaveReviewStudent>
): Column<Student>[] {
  const hasBilling = billingMap.size > 0

  const cols: Column<Student>[] = [
    {
      key: "full_name",
      header: "Nama",
      cell: (row) => <span className="font-medium">{row.full_name}</span>,
    },
    {
      key: "grade",
      header: "Kelas",
      cell: (row) => GRADE_LABELS[row.grade as StudentGrade] ?? row.grade,
    },
    {
      key: "school_level",
      header: "Tingkat",
      cell: (row) => {
        const label = SCHOOL_LEVEL_LABELS[row.school_level]
        const short = row.school_level === "ELEMENTARY" ? "TK/SD" : "SMP/SMA"
        return <span title={label}>{short}</span>
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => {
        const review = leaveReviewMap.get(row.id)
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <StudentStatusBadge status={row.status} />
            {review && <LeaveReviewBadge alert={review} />}
          </div>
        )
      },
    },
    {
      key: "enrolled_at",
      header: "Terdaftar",
      cell: (row) => formatDate(row.enrolled_at),
    },
  ]

  if (hasBilling) {
    cols.push(
      {
        key: "billing_status",
        header: "Tagihan",
        cell: (row) => {
          const entry = billingMap.get(row.id)
          if (!entry) return <span className="text-muted-foreground text-xs">—</span>
          if (entry.onLeave && entry.paymentStatus === null) {
            return <StatusBadge status="on_leave" />
          }
          if (entry.paymentStatus === null) return <span className="text-muted-foreground text-xs">—</span>
          return <PaymentStatusBadge status={entry.paymentStatus} />
        },
      },
      {
        key: "wa_status",
        header: "Link WA",
        cell: (row) => {
          const entry = billingMap.get(row.id)
          if (!entry || entry.whatsappStatus === "not_applicable") {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          return <StatusBadge status={entry.whatsappStatus} />
        },
      },
      {
        key: "attention",
        header: "Tindakan",
        cell: (row) => {
          const entry = billingMap.get(row.id)
          if (!entry || !entry.attentionReason) return null
          return <StatusBadge status={`attention_${entry.attentionReason}`} />
        },
      }
    )
  }

  return cols
}

interface StudentTableProps {
  students: Student[]
  billingMap?: Map<string, StudentBillingEntry>
  leaveReviewMap?: Map<string, LeaveReviewStudent>
  isLoading?: boolean
}

export function StudentTable({
  students,
  billingMap = new Map(),
  leaveReviewMap = new Map(),
  isLoading,
}: StudentTableProps) {
  const router = useRouter()
  const columns = makeColumns(billingMap, leaveReviewMap)

  return (
    <DataTable
      columns={columns}
      data={students}
      isLoading={isLoading}
      emptyMessage="Belum ada data siswa."
      onRowClick={(student) => router.push(`/students/${student.id}`)}
    />
  )
}
