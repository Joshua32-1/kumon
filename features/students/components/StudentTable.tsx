"use client"

import { useRouter } from "next/navigation"
import { DataTable, type Column } from "@/components/shared/DataTable"
import { StudentStatusBadge } from "./StudentStatusBadge"
import { formatDate } from "@/lib/utils"
import type { Student } from "../types"

const columns: Column<Student>[] = [
  {
    key: "full_name",
    header: "Nama",
    cell: (row) => <span className="font-medium">{row.full_name}</span>,
  },
  {
    key: "grade",
    header: "Kelas",
    cell: (row) => row.grade ?? "—",
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => <StudentStatusBadge status={row.status} />,
  },
  {
    key: "enrolled_at",
    header: "Terdaftar",
    cell: (row) => formatDate(row.enrolled_at),
  },
]

interface StudentTableProps {
  students: Student[]
  isLoading?: boolean
}

export function StudentTable({ students, isLoading }: StudentTableProps) {
  const router = useRouter()

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
