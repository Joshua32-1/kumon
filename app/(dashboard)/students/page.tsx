"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import useSWR from "swr"
import { PageHeader } from "@/components/shared/PageHeader"
import { FilterPill } from "@/components/shared/FilterPill"
import { PeriodSelector } from "@/components/shared/PeriodSelector"
import { AlertBanner } from "@/components/shared/AlertPanel"
import { StudentTable } from "@/features/students/components/StudentTable"
import type { StudentBillingEntry } from "@/features/students/components/StudentTable"
import { Button } from "@/components/ui/button"
import { currentMonthYearInCenterTimezone } from "@/lib/utils"
import type { Student, StudentStatus, LeaveReviewListResult } from "@/features/students/types"

const fetcher = (url: string) => fetch(url).then((r) => r.json()).then((r) => r.data)

type BillingEntry = {
  invoice: { status: string } | null
  summary: { whatsappStatus: string; attention: string; attentionReason: string | null }
  onLeave: boolean
}

const billingFetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((r) => r.data as { month: number; year: number; billing: Record<string, BillingEntry> })

const STATUS_FILTERS = [
  { label: "Semua", value: "" },
  { label: "Aktif", value: "ACTIVE" },
  { label: "Cuti", value: "TEMPORARY_LEAVE" },
  { label: "Tidak Aktif", value: "INACTIVE" },
] as const

const { month: currentMonth, year: currentYear } = currentMonthYearInCenterTimezone()

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agt", "Sep", "Okt", "Nov", "Des",
]
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const YEARS = [currentYear - 1, currentYear, currentYear + 1]

export default function StudentsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const statusParam = (searchParams.get("status") ?? "") as StudentStatus | ""

  const [billingMonth, setBillingMonth] = useState(currentMonth)
  const [billingYear, setBillingYear] = useState(currentYear)
  const [attentionOnly, setAttentionOnly] = useState(false)

  const studentUrl = statusParam ? `/api/students?status=${statusParam}` : "/api/students"
  const billingUrl = `/api/students/billing?month=${billingMonth}&year=${billingYear}`

  const { data: students = [], isLoading } = useSWR<Student[]>(studentUrl, fetcher)
  const { data: billingData } = useSWR(billingUrl, billingFetcher)
  const { data: leaveReviewData } = useSWR<LeaveReviewListResult>(
    "/api/students/leave-review",
    fetcher
  )

  const leaveReviewMap = new Map(
    (leaveReviewData?.students ?? []).map((s) => [s.id, s])
  )

  const billingMap = new Map<string, StudentBillingEntry>()
  if (billingData?.billing) {
    for (const [studentId, entry] of Object.entries(billingData.billing)) {
      billingMap.set(studentId, {
        paymentStatus: entry.invoice ? (entry.invoice.status as StudentBillingEntry["paymentStatus"]) : null,
        whatsappStatus: entry.summary.whatsappStatus as StudentBillingEntry["whatsappStatus"],
        attention: entry.summary.attention as StudentBillingEntry["attention"],
        attentionReason: entry.summary.attentionReason as StudentBillingEntry["attentionReason"],
        onLeave: entry.onLeave,
      })
    }
  }

  const attentionCount = students.filter((s) => billingMap.get(s.id)?.attentionReason != null).length

  const visibleStudents = attentionOnly
    ? students.filter((s) => billingMap.get(s.id)?.attentionReason != null)
    : students

  return (
    <>
      <PageHeader
        title="Siswa"
        description={`${visibleStudents.length} siswa · Status tagihan ${MONTH_NAMES[billingMonth - 1]} ${billingYear}`}
        action={
          <Link href="/students/new">
            <Button>+ Tambah Siswa</Button>
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4 shadow-card">
        {STATUS_FILTERS.map((f) => (
          <FilterPill
            key={f.value}
            label={f.label}
            active={(statusParam ?? "") === f.value}
            onClick={() => router.push(f.value ? `/students?status=${f.value}` : "/students")}
          />
        ))}

        <FilterPill
          label={`Perlu tindakan${attentionCount > 0 ? ` (${attentionCount})` : ""}`}
          active={attentionOnly}
          variant="attention"
          onClick={() => setAttentionOnly((v) => !v)}
        />

        <PeriodSelector
          month={billingMonth}
          year={billingYear}
          onMonthChange={setBillingMonth}
          onYearChange={setBillingYear}
          monthNames={MONTH_NAMES}
          months={MONTHS}
          years={YEARS}
        />
      </div>

      {leaveReviewData && leaveReviewData.students.length > 0 && (
        <AlertBanner variant="warning">
          {leaveReviewData.students.length} siswa cuti{" "}
          {leaveReviewData.max_consecutive_months}+ bulan <strong>berturut-turut</strong> — lihat
          badge &quot;Cuti N+ bln&quot; di tabel atau buka profil untuk menonaktifkan.
        </AlertBanner>
      )}

      <StudentTable
        students={visibleStudents}
        billingMap={billingMap}
        leaveReviewMap={leaveReviewMap}
        isLoading={isLoading}
      />
    </>
  )
}
