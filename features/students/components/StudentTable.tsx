"use client"

import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import { DataTable, type Column } from "@/components/shared/DataTable"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StudentStatusBadge } from "./StudentStatusBadge"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { PaymentStatusBadge } from "@/features/payments/components/PaymentStatusBadge"
import { formatMonthYear } from "@/lib/utils"
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
  leaveReviewMap: Map<string, LeaveReviewStudent>,
  onSetLeave: ((student: Student) => void) | undefined,
  onViewProfile: (student: Student) => void
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
      cell: (row) => formatMonthYear(row.enrolled_at),
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

  if (onSetLeave) {
    cols.push({
      key: "actions",
      header: "",
      className: "w-10 text-right",
      cell: (row) => (
        // Keep menu clicks from triggering the row's navigation click handler.
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" aria-label="Aksi siswa" />}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {row.status !== "INACTIVE" && (
                <DropdownMenuItem onClick={() => onSetLeave(row)}>Atur Cuti</DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onViewProfile(row)}>Lihat Profil</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    })
  }

  return cols
}

interface StudentTableProps {
  students: Student[]
  billingMap?: Map<string, StudentBillingEntry>
  leaveReviewMap?: Map<string, LeaveReviewStudent>
  isLoading?: boolean
  onSetLeave?: (student: Student) => void
}

export function StudentTable({
  students,
  billingMap = new Map(),
  leaveReviewMap = new Map(),
  isLoading,
  onSetLeave,
}: StudentTableProps) {
  const router = useRouter()
  const columns = makeColumns(billingMap, leaveReviewMap, onSetLeave, (student) =>
    router.push(`/students/${student.id}`)
  )

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
