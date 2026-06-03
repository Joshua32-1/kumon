"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { PageHeader } from "@/components/shared/PageHeader"
import { PaymentTable } from "@/features/payments/components/PaymentTable"
import { GenerateInvoicesDialog } from "@/features/payments/components/GenerateInvoicesDialog"
import { Button } from "@/components/ui/button"
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
]

export default function PaymentsPage() {
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "">("")
  const [generateOpen, setGenerateOpen] = useState(false)

  const url = statusFilter
    ? `/api/payments?status=${statusFilter}`
    : "/api/payments"

  const { data: invoices = [], isLoading, mutate } = useSWR(url, fetcher)

  return (
    <>
      <PageHeader
        title="Pembayaran"
        description={`${invoices.length} tagihan`}
        action={
          <Button onClick={() => setGenerateOpen(true)}>Buat Tagihan Bulanan</Button>
        }
      />

      {/* Status filters */}
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

      <PaymentTable invoices={invoices} isLoading={isLoading} />

      <GenerateInvoicesDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onGenerated={() => mutate()}
      />
    </>
  )
}
