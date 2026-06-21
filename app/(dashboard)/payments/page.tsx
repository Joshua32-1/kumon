"use client"

import { useState, useEffect, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { PageHeader } from "@/components/shared/PageHeader"
import { FilterPill } from "@/components/shared/FilterPill"
import { PeriodSelector } from "@/components/shared/PeriodSelector"
import { PaymentTable } from "@/features/payments/components/PaymentTable"
import { GenerateInvoicesDialog } from "@/features/payments/components/GenerateInvoicesDialog"
import { SendPaymentLinksDialog } from "@/features/payments/components/SendPaymentLinksDialog"
import { Button } from "@/components/ui/button"
import { MessageCircle } from "lucide-react"
import {
  getBillingSummary,
  type WhatsAppDeliveryConfirmation,
} from "@/features/payments/billing-summary"
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

// Delivery-confirmation buckets (Meta callbacks), independent of payment status.
const DELIVERY_FILTERS: { label: string; value: WhatsAppDeliveryConfirmation | "" }[] = [
  { label: "Semua", value: "" },
  { label: "Dibaca", value: "read" },
  { label: "Tersampaikan", value: "delivered" },
  { label: "Menunggu konfirmasi", value: "awaiting" },
  { label: "Gagal terkirim", value: "failed" },
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
  const [deliveryFilter, setDeliveryFilter] = useState<WhatsAppDeliveryConfirmation | "">("")

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
    const delivery = searchParams.get("delivery")
    if (
      delivery === "read" ||
      delivery === "delivered" ||
      delivery === "awaiting" ||
      delivery === "failed"
    ) {
      setDeliveryFilter(delivery)
    }
  }, [searchParams])

  const [arrearsView, setArrearsView] = useState(false)
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [month, setMonth] = useState(defaultMonth)
  const [year, setYear] = useState(defaultYear)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [sendLinksOpen, setSendLinksOpen] = useState(false)

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

  // Compute each invoice's billing summary once per render (the getBillingSummary
  // call is the costly bit) and reuse it for every filter and count below.
  const summaries = useMemo(() => {
    const m = new Map<string, ReturnType<typeof getBillingSummary>>()
    for (const inv of allInvoices) {
      m.set(
        inv.id,
        getBillingSummary(inv, inv.payment_reminders ?? [], today, inv.message_events ?? [])
      )
    }
    return m
  }, [allInvoices, today])

  const baseInvoices = arrearsView
    ? allInvoices
        .filter((inv) => isArrearsInvoice(inv, today))
        .sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year
          return a.month - b.month
        })
    : allInvoices

  const afterAttention = attentionOnly
    ? baseInvoices.filter((inv) => summaries.get(inv.id)?.attention === "needs_action")
    : baseInvoices

  const invoices = deliveryFilter
    ? afterAttention.filter((inv) => summaries.get(inv.id)?.deliveryStatus === deliveryFilter)
    : afterAttention

  const deliveryCount = allInvoices.filter(
    (inv) => summaries.get(inv.id)?.attentionReason === "delivery"
  ).length
  const collectionCount = allInvoices.filter(
    (inv) => summaries.get(inv.id)?.attentionReason === "collection"
  ).length
  const attentionCount = deliveryCount + collectionCount

  // Per-bucket counts for the delivery filter pills. Computed over the post-attention
  // set so a bucket's number matches exactly what you'll see when you select it.
  const deliveryStatusCounts = afterAttention.reduce<
    Partial<Record<WhatsAppDeliveryConfirmation, number>>
  >((acc, inv) => {
    const d = summaries.get(inv.id)?.deliveryStatus ?? "unknown"
    acc[d] = (acc[d] ?? 0) + 1
    return acc
  }, {})

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
          <div className="flex items-center gap-2">
            <Button onClick={() => setGenerateOpen(true)}>Buat Tagihan Bulanan</Button>
            {!arrearsView && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSendLinksOpen(true)}
                title="Kirim link pembayaran via WhatsApp"
                aria-label="Kirim link pembayaran via WhatsApp"
              >
                <MessageCircle />
              </Button>
            )}
          </div>
        }
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4 shadow-card">
          <FilterPill
            label="Bulan ini"
            active={!arrearsView}
            onClick={() => { setArrearsView(false); setStatusFilter(""); setDeliveryFilter("") }}
          />
          <FilterPill
            label="Semua tunggakan"
            active={arrearsView}
            variant="danger"
            onClick={() => { setArrearsView(true); setStatusFilter(""); setDeliveryFilter("") }}
          />
        </div>

        {!arrearsView && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4 shadow-card">
            <PeriodSelector
              month={month}
              year={year}
              onMonthChange={setMonth}
              onYearChange={setYear}
              monthNames={MONTH_NAMES}
              months={MONTHS}
              years={YEARS}
              label="Periode:"
            />
          </div>
        )}

        {!arrearsView && (
          <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-4 shadow-card">
            {STATUS_FILTERS.map((f) => (
              <FilterPill
                key={f.value}
                label={f.label}
                active={statusFilter === f.value}
                onClick={() => setStatusFilter(f.value)}
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4 shadow-card">
          <span className="self-center text-sm text-muted-foreground">Pengiriman WA:</span>
          {DELIVERY_FILTERS.map((f) => {
            const count = f.value ? deliveryStatusCounts[f.value] ?? 0 : 0
            return (
              <FilterPill
                key={f.value || "all"}
                label={f.value && count > 0 ? `${f.label} (${count})` : f.label}
                active={deliveryFilter === f.value}
                onClick={() => setDeliveryFilter(f.value)}
              />
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4 shadow-card">
          <FilterPill
            label={`Perlu tindakan${attentionCount > 0 ? ` (${attentionCount})` : ""}`}
            active={attentionOnly}
            variant="attention"
            onClick={() => setAttentionOnly((v) => !v)}
          />
          {(deliveryCount > 0 || collectionCount > 0) && (
            <span className="self-center text-xs text-muted-foreground">
              {deliveryCount > 0 && `${deliveryCount} WA`}
              {deliveryCount > 0 && collectionCount > 0 && " · "}
              {collectionCount > 0 && `${collectionCount} tunggakan`}
            </span>
          )}
        </div>
      </div>

      <PaymentTable invoices={invoices} isLoading={isLoading} />

      <GenerateInvoicesDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onGenerated={() => mutate()}
      />

      <SendPaymentLinksDialog
        open={sendLinksOpen}
        onOpenChange={setSendLinksOpen}
        month={month}
        year={year}
        onSent={() => mutate()}
      />
    </>
  )
}
