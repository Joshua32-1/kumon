"use client"

import { useState } from "react"
import useSWR from "swr"
import { Download } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/shared/LoadingSpinner"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { PaymentLedgerRow } from "@/lib/reports/csv"
import type { PaymentStatus } from "@/features/payments/types"
import { formatRupiah, formatDate, currentMonthYearInCenterTimezone } from "@/lib/utils"

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to load ledger")
    return res.json().then((body) => body.data as PaymentLedgerRow[])
  })

const STATUS_OPTIONS: { label: string; value: PaymentStatus | "ALL" }[] = [
  { label: "Semua status", value: "ALL" },
  { label: "Lunas", value: "PAID" },
  { label: "Belum Bayar", value: "PENDING" },
  { label: "Terlambat", value: "OVERDUE" },
  { label: "Dibatalkan", value: "CANCELLED" },
  { label: "Dibebaskan", value: "WAIVED" },
  { label: "Lunas (link lama)", value: "PAID_OLD_LINK" },
]

const STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Belum Bayar",
  PAID: "Lunas",
  OVERDUE: "Terlambat",
  CANCELLED: "Dibatalkan",
  WAIVED: "Dibebaskan",
  PAID_OLD_LINK: "Lunas (link lama)",
}

const { year: thisYear } = currentMonthYearInCenterTimezone()
const YEARS = [thisYear - 2, thisYear - 1, thisYear, thisYear + 1]

export function PaymentLedgerExport() {
  const [year, setYear] = useState(thisYear)
  const [status, setStatus] = useState<PaymentStatus | "ALL">("ALL")

  const query = new URLSearchParams({ year: String(year) })
  if (status !== "ALL") query.set("status", status)

  const { data: rows = [], isLoading, error } = useSWR(
    `/api/reports/payment-ledger?${query.toString()}`,
    fetcher
  )

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Buku Pembayaran</CardTitle>
        <CardDescription>Rekap tagihan setahun untuk pembukuan</CardDescription>
        <CardAction>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger size="sm" className="min-w-[5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as PaymentStatus | "ALL")}>
              <SelectTrigger size="sm" className="min-w-[9rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <a
              href={`/api/reports/export?${query.toString()}`}
              download
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download className="size-4" /> Ekspor CSV
            </a>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="pt-6">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Gagal memuat buku pembayaran.
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Tidak ada tagihan untuk filter ini.
          </div>
        ) : (
          <div className="max-h-[28rem] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bulan</TableHead>
                  <TableHead>Siswa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead>Dibayar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={`${r.month}-${r.student_name}-${i}`}>
                    <TableCell>{r.month}</TableCell>
                    <TableCell>{r.student_name}</TableCell>
                    <TableCell>{STATUS_LABELS[r.status]}</TableCell>
                    <TableCell className="text-right">{formatRupiah(r.amount)}</TableCell>
                    <TableCell>{r.paid_at ? formatDate(r.paid_at) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
