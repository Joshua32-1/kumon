"use client"

import { useRouter } from "next/navigation"
import { DataTable, type Column } from "@/components/shared/DataTable"
import { PaymentStatusBadge } from "./PaymentStatusBadge"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { formatRupiah, getMonthName } from "@/lib/utils"
import { getBillingSummary } from "@/features/payments/billing-summary"
import type { InvoiceWithStudent } from "../types"

const columns: Column<InvoiceWithStudent>[] = [
  {
    key: "student",
    header: "Siswa",
    cell: (row) => (
      <span className="font-medium">{row.students?.full_name ?? "—"}</span>
    ),
  },
  {
    key: "period",
    header: "Periode",
    cell: (row) => `${getMonthName(row.month)} ${row.year}`,
  },
  {
    key: "amount",
    header: "Tagihan",
    cell: (row) => formatRupiah(row.amount),
    className: "text-right",
  },
  {
    key: "status",
    header: "Pembayaran",
    cell: (row) => <PaymentStatusBadge status={row.status} />,
  },
  {
    key: "midtrans_link",
    header: "Link Midtrans",
    cell: (row) =>
      row.midtrans_payment_url ? (
        <span className="text-xs text-green-700 font-medium">Ada</span>
      ) : (
        <span className="text-xs text-muted-foreground">Belum</span>
      ),
  },
  {
    key: "wa_status",
    header: "Link WA",
    cell: (row) => {
      const summary = getBillingSummary(row, row.payment_reminders ?? [])
      if (summary.whatsappStatus === "not_applicable") return <span className="text-muted-foreground text-xs">—</span>
      return <StatusBadge status={summary.whatsappStatus} />
    },
  },
  {
    key: "attention",
    header: "Tindakan",
    cell: (row) => {
      const summary = getBillingSummary(row, row.payment_reminders ?? [])
      if (summary.attentionReason === "delivery") {
        return <StatusBadge status="attention_delivery" />
      }
      if (summary.attentionReason === "collection") {
        return <StatusBadge status="attention_collection" />
      }
      return null
    },
  },
  {
    key: "due_date",
    header: "Jatuh Tempo",
    cell: (row) =>
      new Date(row.due_date).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
  },
]

interface PaymentTableProps {
  invoices: InvoiceWithStudent[]
  isLoading?: boolean
}

export function PaymentTable({ invoices, isLoading }: PaymentTableProps) {
  const router = useRouter()

  return (
    <DataTable
      columns={columns}
      data={invoices}
      isLoading={isLoading}
      emptyMessage="Belum ada data tagihan."
      onRowClick={(inv) => router.push(`/payments/${inv.id}`)}
    />
  )
}
