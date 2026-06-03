"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PaymentStatusBadge } from "./PaymentStatusBadge"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { formatRupiah, getMonthName, formatDate } from "@/lib/utils"
import { markPaidAction, waiveAction, cancelInvoiceAction, createCheckoutAction } from "../actions"
import type { InvoiceWithStudent, PaymentReminder } from "../types"

interface InvoiceCardProps {
  invoice: InvoiceWithStudent & { payment_reminders?: PaymentReminder[] }
  onUpdate?: () => void
}

export function InvoiceCard({ invoice, onUpdate }: InvoiceCardProps) {
  const [waiveOpen, setWaiveOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const isPending = invoice.status === "PENDING" || invoice.status === "OVERDUE"

  async function handleMarkPaid() {
    setIsProcessing(true)
    await markPaidAction(invoice.id)
    toast.success("Pembayaran dicatat sebagai lunas.")
    setIsProcessing(false)
    onUpdate?.()
  }

  async function handleWaive() {
    setIsProcessing(true)
    await waiveAction(invoice.id, "Dibebaskan oleh admin")
    toast.success("Tagihan dibebaskan.")
    setIsProcessing(false)
    setWaiveOpen(false)
    onUpdate?.()
  }

  async function handleCancel() {
    setIsProcessing(true)
    await cancelInvoiceAction(invoice.id)
    toast.success("Tagihan dibatalkan.")
    setIsProcessing(false)
    setCancelOpen(false)
    onUpdate?.()
  }

  async function handleCreateCheckout() {
    setIsProcessing(true)
    const result = await createCheckoutAction(invoice.id)
    setIsProcessing(false)
    if ("data" in result && result.data?.paymentUrl) {
      navigator.clipboard.writeText(result.data.paymentUrl)
      toast.success("Link pembayaran disalin ke clipboard.")
      onUpdate?.()
    } else {
      toast.error("Gagal membuat link pembayaran.")
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">
              {getMonthName(invoice.month)} {invoice.year}
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {invoice.students?.full_name}
            </p>
          </div>
          <PaymentStatusBadge status={invoice.status} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Tagihan</p>
              <p className="font-semibold">{formatRupiah(invoice.amount)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Jatuh Tempo</p>
              <p className="font-medium">{formatDate(invoice.due_date)}</p>
            </div>
            {invoice.paid_at && (
              <div>
                <p className="text-muted-foreground">Dibayar</p>
                <p className="font-medium">{formatDate(invoice.paid_at)}</p>
              </div>
            )}
            {invoice.notes && (
              <div>
                <p className="text-muted-foreground">Catatan</p>
                <p>{invoice.notes}</p>
              </div>
            )}
          </div>

          {invoice.midtrans_payment_url && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs break-all">
              <span className="text-muted-foreground">Link: </span>
              <a
                href={invoice.midtrans_payment_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {invoice.midtrans_payment_url}
              </a>
            </div>
          )}

          {/* Reminders */}
          {invoice.payment_reminders && invoice.payment_reminders.length > 0 && (
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Pengingat
              </p>
              {invoice.payment_reminders.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span>
                    Pengingat {r.reminder_number} —{" "}
                    {new Date(r.scheduled_date).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          )}

          {isPending && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={handleMarkPaid} disabled={isProcessing}>
                Tandai Lunas
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCreateCheckout}
                disabled={isProcessing}
              >
                {invoice.midtrans_payment_url ? "Buat Ulang Link" : "Buat Link Bayar"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setWaiveOpen(true)}
                disabled={isProcessing}
              >
                Bebaskan
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setCancelOpen(true)}
                disabled={isProcessing}
              >
                Batalkan
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={waiveOpen}
        onOpenChange={setWaiveOpen}
        title="Bebaskan Tagihan"
        description="Tagihan ini akan ditandai sebagai dibebaskan (waived). Pengingat akan dibatalkan."
        confirmLabel="Bebaskan"
        onConfirm={handleWaive}
        isLoading={isProcessing}
      />
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Batalkan Tagihan"
        description="Tagihan ini akan dibatalkan. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Batalkan Tagihan"
        variant="destructive"
        onConfirm={handleCancel}
        isLoading={isProcessing}
      />
    </>
  )
}
