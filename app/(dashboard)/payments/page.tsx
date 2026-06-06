"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { PageHeader } from "@/components/shared/PageHeader"
import { PaymentTable } from "@/features/payments/components/PaymentTable"
import { GenerateInvoicesDialog } from "@/features/payments/components/GenerateInvoicesDialog"
import { Button } from "@/components/ui/button"
import { getBillingSummary } from "@/features/payments/billing-summary"
import { isArrearsInvoice } from "@/lib/billing/arrears"
import { formatRupiah, currentMonthYearInCenterTimezone, todayInCenterTimezone } from "@/lib/utils"
import type { InvoiceWithStudent, PaymentStatus } from "@/features/payments/types"

const fetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((r) => r.data as InvoiceWithStudent[])

const STATUS_FILTERS: { label: string; value: PaymentStatus | "" }[] = [
  { label: "Semua", value: "" },
  { label: "Belum Bayar", value: "PENDING" },
  { label: "Lunas", value: "PAID" },
  { label: "Terlambat", value: "OVERDUE" },
  { label: "Dibatalkan", value: "CANCELLED" },
  { label: "Dibebaskan", value: "WAIVED" },
  { label: "Lunas (link lama)", value: "PAID_OLD_LINK" },
]

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const { year: currentYear } = currentMonthYearInCenterTimezone()
const YEARS = [currentYear - 1, currentYear, currentYear + 1]

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agt", "Sep", "Okt", "Nov", "Des",
]

export default function PaymentsPage() {
  const searchParams = useSearchParams()
  const today = todayInCenterTimezone()
  const { month: defaultMonth, year: defaultYear } = currentMonthYearInCenterTimezone()
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "">("")

  useEffect(() => {
    const status = searchParams.get("status")
    if (
      status === "PENDING" ||
      status === "PAID" ||
      status === "OVERDUE" ||
      status === "CANCELLED" ||
      status === "WAIVED" ||
      status === "PAID_OLD_LINK"
    ) {
      setStatusFilter(status)
    }
  }, [searchParams])

  // arrears view shows all months at once, sorted oldest first
  const [arrearsView, setArrearsView] = useState(false)
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [month, setMonth] = useState(defaultMonth)
  const [year, setYear] = useState(defaultYear)
  const [generateOpen, setGenerateOpen] = useState(false)

  // Initialise from URL params on first render
  useEffect(() => {
    if (searchParams.get("view") === "arrears") setArrearsView(true)
    if (searchParams.get("attention") === "1") setAttentionOnly(true)
    const m = searchParams.get("month")
    const y = searchParams.get("year")
    if (m) setMonth(Number(m))
    if (y) setYear(Number(y))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const params = new URLSearchParams()
  if (statusFilter) params.set("status", statusFilter)
  if (!arrearsView) {
    params.set("month", String(month))
    params.set("year", String(year))
  }

  const { data: allInvoices = [], isLoading, mutate } = useSWR(
    `/api/payments?${params.toString()}`,
    fetcher
  )

  // In arrears view, client-filter to only show overdue/past-due
  const baseInvoices = arrearsView
    ? allInvoices
        .filter((inv) => isArrearsInvoice(inv, today))
        .sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year
          return a.month - b.month
        })
    : allInvoices

  const invoices = attentionOnly
    ? baseInvoices.filter((inv) => {
        const s = getBillingSummary(inv, inv.payment_reminders ?? [], today)
        return s.attention === "needs_action"
      })
    : baseInvoices

  const deliveryCount = allInvoices.filter((inv) => {
    const s = getBillingSummary(inv, inv.payment_reminders ?? [], today)
    return s.attentionReason === "delivery"
  }).length

  const collectionCount = allInvoices.filter((inv) => {
    const s = getBillingSummary(inv, inv.payment_reminders ?? [], today)
    return s.attentionReason === "collection"
  }).length

  const attentionCount = deliveryCount + collectionCount

  const arrearsTotalRp = baseInvoices.reduce((s, inv) => s + inv.amount, 0)

  const pageDescription = arrearsView
    ? `${invoices.length} tunggakan · ${formatRupiah(arrearsTotalRp)}`
    : `${invoices.length} tagihan · ${MONTH_NAMES[month - 1]} ${year}`

  return (
    <>
      <PageHeader
        title="Pembayaran"
        description={pageDescription}
        action={
          <Button onClick={() => setGenerateOpen(true)}>Buat Tagihan Bulanan</Button>
        }
      />

      {/* View toggle: bulan ini vs semua tunggakan */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => { setArrearsView(false); setStatusFilter("") }}
          className={`rounded-md border px-3 py-1 text-sm transition-colors ${
            !arrearsView
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border hover:bg-muted"
          }`}
        >
          Bulan ini
        </button>
        <button
          onClick={() => { setArrearsView(true); setStatusFilter("") }}
          className={`rounded-md border px-3 py-1 text-sm transition-colors ${
            arrearsView
              ? "bg-red-600 text-white border-red-600"
              : "border-border hover:bg-muted"
          }`}
        >
          Semua tunggakan
        </button>
      </div>

      {/* Month / year selectors (only in bulan ini mode) */}
      {!arrearsView && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            {MONTHS.map((m) => (
              <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      )}

      {/* Status filters (only in bulan ini mode) */}
      {!arrearsView && (
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                statusFilter === f.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Attention filter — shown in both modes */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setAttentionOnly((v) => !v)}
          className={`rounded-md border px-3 py-1 text-sm transition-colors ${
            attentionOnly
              ? "bg-red-600 text-white border-red-600"
              : "border-border hover:bg-muted"
          }`}
        >
          Perlu tindakan{attentionCount > 0 ? ` (${attentionCount})` : ""}
        </button>
        {(deliveryCount > 0 || collectionCount > 0) && (
          <span className="self-center text-xs text-muted-foreground">
            {deliveryCount > 0 && `${deliveryCount} WA`}
            {deliveryCount > 0 && collectionCount > 0 && " · "}
            {collectionCount > 0 && `${collectionCount} tunggakan`}
          </span>
        )}
      </div>

      <PaymentTable invoices={invoices} isLoading={isLoading} />

      <GenerateInvoicesDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onGenerated={() => mutate()}
      />
    </>
  )
}
