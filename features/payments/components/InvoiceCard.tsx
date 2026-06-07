"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PaymentStatusBadge } from "./PaymentStatusBadge"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { formatRupiah, getMonthName, formatDate } from "@/lib/utils"
import { getBillingSummary, WA_STATUS_LABELS } from "@/features/payments/billing-summary"
import {
  markPaidAction,
  waiveAction,
  cancelInvoiceAction,
  regenerateInvoiceAction,
  sendReminderNowAction,
  markReminderSentManuallyAction,
  getReminderMessagePreviewAction,
  sendConfirmationAction,
  reconcileMidtransAction,
} from "../actions"
import type { InvoiceWithStudent, PaymentReminder } from "../types"

interface InvoiceCardProps {
  invoice: InvoiceWithStudent & { payment_reminders?: PaymentReminder[] }
  onUpdate?: () => void
}

export function InvoiceCard({ invoice, onUpdate }: InvoiceCardProps) {
  const [waiveOpen, setWaiveOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [markManualReminderId, setMarkManualReminderId] = useState<string | null>(null)
  const [regenerateOpen, setRegenerateOpen] = useState(false)

  const isPending = invoice.status === "PENDING" || invoice.status === "OVERDUE"
  const isPaidOldLink = invoice.status === "PAID_OLD_LINK"
  const lineItems = invoice.invoice_line_items ?? []
  const reminders = invoice.payment_reminders ?? []
  const summary = getBillingSummary(invoice, reminders)

  async function handleMarkPaid() {
    setIsProcessing(true)
    await markPaidAction(invoice.id)
    toast.success("Pembayaran dicatat sebagai lunas.")
    setIsProcessing(false)
    onUpdate?.()
  }

  async function handleReconcileMidtrans() {
    setIsProcessing(true)
    const result = await reconcileMidtransAction(invoice.id)
    setIsProcessing(false)
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    if (result.synced) {
      toast.success(result.message)
      onUpdate?.()
    } else {
      toast.info(result.message)
    }
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

  async function handleRegenerate() {
    setIsProcessing(true)
    const result = await regenerateInvoiceAction(invoice.id)
    setIsProcessing(false)
    if ("data" in result && result.data?.paymentUrl) {
      navigator.clipboard.writeText(result.data.paymentUrl)
      toast.success("Tagihan dihitung ulang. Link baru disalin ke clipboard.")
      setRegenerateOpen(false)
      onUpdate?.()
    } else {
      toast.error("Gagal menghitung ulang tagihan.")
    }
  }

  async function handleSendReminderNow(reminderId?: string) {
    setIsProcessing(true)
    const result = await sendReminderNowAction(invoice.id, reminderId)
    setIsProcessing(false)
    if (result.ok) {
      toast.success("Pengingat WhatsApp berhasil dikirim.")
      onUpdate?.()
    } else {
      toast.error(`Gagal mengirim: ${result.error ?? "unknown error"}`)
    }
  }

  async function handleMarkManualSent(reminderId: string) {
    setIsProcessing(true)
    const result = await markReminderSentManuallyAction(reminderId, invoice.id)
    setIsProcessing(false)
    setMarkManualReminderId(null)
    if (result.ok) {
      toast.success("Pengingat ditandai terkirim secara manual.")
      onUpdate?.()
    } else {
      toast.error(result.error ?? "Gagal menandai pengingat.")
    }
  }

  async function handleCopyMessage() {
    setIsProcessing(true)
    const result = await getReminderMessagePreviewAction(invoice.id)
    setIsProcessing(false)
    if (result) {
      navigator.clipboard.writeText(result.message)
      toast.success(`Pesan disalin. Kirim ke: ${result.whatsappNumber}`)
    } else {
      toast.error("Gagal membuat pesan. Pastikan kontak dan link tersedia.")
    }
  }

  async function handleSendConfirmation() {
    setIsProcessing(true)
    const result = await sendConfirmationAction(invoice.id)
    setIsProcessing(false)
    if (result.ok) {
      toast.success("Konfirmasi pembayaran berhasil dikirim.")
    } else {
      toast.error(`Gagal mengirim konfirmasi: ${result.error ?? "unknown error"}`)
    }
  }

  const attentionMessage: { text: string; variant: "orange" | "red" } | null =
    summary.attentionReason === "delivery"
      ? summary.whatsappStatus === "no_link"
        ? { text: "Link Midtrans belum dibuat. Buat link agar bisa dikirim ke orang tua.", variant: "orange" }
        : summary.whatsappStatus === "send_failed"
        ? { text: "Pengiriman WhatsApp gagal. Coba kirim ulang atau salin pesan secara manual.", variant: "orange" }
        : summary.whatsappStatus === "partial_failed"
        ? { text: "Sebagian pengingat gagal dikirim. Periksa dan coba kirim ulang.", variant: "orange" }
        : { text: "Link belum dikirim ke orang tua.", variant: "orange" }
      : summary.attentionReason === "collection"
      ? { text: "Tagihan belum lunas. Orang tua sudah dihubungi — tindak lanjuti jika perlu.", variant: "red" }
      : null

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
          {/* Attention banner */}
          {attentionMessage && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${
              attentionMessage.variant === "red"
                ? "border-[var(--danger-border)] bg-[var(--danger-muted)] text-[var(--danger-foreground)]"
                : "border-[var(--warning-border)] bg-[var(--warning-muted)] text-[var(--warning-foreground)]"
            }`}>
              {attentionMessage.text}
            </div>
          )}

          {isPaidOldLink && (
            <div className="rounded-lg border border-[var(--highlight-border)] bg-[var(--highlight-muted)] px-3 py-2 text-sm text-[var(--highlight-foreground)]">
              <p className="font-medium">Pembayaran via link lama</p>
              <p className="mt-1">
                Orang tua membayar link yang sudah tidak berlaku (tagihan dibatalkan/dibebaskan
                atau diganti). Hubungi orang tua untuk konfirmasi — pertimbangkan refund atau
                alokasi ke tagihan aktif.
              </p>
              {invoice.midtrans_transaction_id && (
                <p className="mt-1 text-xs text-[var(--highlight)]">
                  ID transaksi: {invoice.midtrans_transaction_id}
                </p>
              )}
            </div>
          )}

          {/* Line items breakdown */}
          {lineItems.length > 0 && (
            <div className="space-y-1 rounded-lg border border-border bg-muted/30 px-4 py-3">
              {lineItems.map((item) => (
                <div key={item.subject} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium">{formatRupiah(item.unit_amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
                <span>Total</span>
                <span className="font-heading text-[var(--highlight)]">{formatRupiah(invoice.amount)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            {lineItems.length === 0 && (
              <div>
                <p className="text-muted-foreground">Tagihan</p>
                <p className="font-semibold">{formatRupiah(invoice.amount)}</p>
              </div>
            )}
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
            <div>
              <p className="text-muted-foreground">Status WA</p>
              <p className="font-medium">{WA_STATUS_LABELS[summary.whatsappStatus]}</p>
            </div>
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
          {reminders.length > 0 && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Pengingat
              </p>
              {reminders
                .slice()
                .sort((a, b) => a.reminder_number - b.reminder_number)
                .map((r) => (
                  <div
                    key={r.id}
                    className="rounded-md border bg-muted/20 px-3 py-2 space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span>
                        Pengingat {r.reminder_number} —{" "}
                        {new Date(r.scheduled_date).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {r.sent_at && (
                          <span className="text-muted-foreground ml-1">
                            · dikirim {new Date(r.sent_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </span>
                      <StatusBadge status={r.status} />
                    </div>

                    {r.status === "FAILED" && r.message_preview && (
                      <p className="truncate text-xs text-[var(--danger)]" title={r.message_preview}>
                        {r.message_preview}
                      </p>
                    )}

                    {r.status === "CANCELLED" && r.message_preview && (
                      <p className="truncate text-xs text-muted-foreground" title={r.message_preview}>
                        {r.message_preview}
                      </p>
                    )}

                    {isPending && (
                      <div className="flex gap-1.5 pt-0.5">
                        <button
                          onClick={() => handleSendReminderNow(r.id)}
                          disabled={isProcessing}
                          className="text-xs text-primary hover:underline disabled:opacity-50"
                        >
                          Kirim ulang
                        </button>
                        <span className="text-muted-foreground text-xs">·</span>
                        <button
                          onClick={() => setMarkManualReminderId(r.id)}
                          disabled={isProcessing}
                          className="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
                        >
                          Tandai terkirim manual
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Action buttons */}
          {isPending && (
            <div className="flex flex-wrap gap-2">
              {invoice.midtrans_order_id && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleReconcileMidtrans}
                  disabled={isProcessing}
                >
                  Sinkronkan Midtrans
                </Button>
              )}
              <Button size="sm" onClick={handleMarkPaid} disabled={isProcessing}>
                Tandai Lunas
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSendReminderNow()}
                disabled={isProcessing}
              >
                Kirim WA sekarang
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyMessage}
                disabled={isProcessing}
              >
                Salin pesan WA
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRegenerateOpen(true)}
                disabled={isProcessing}
              >
                Hitung ulang tagihan
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

          {invoice.status === "PAID" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSendConfirmation}
              disabled={isProcessing}
            >
              Kirim konfirmasi pembayaran
            </Button>
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
        description="Tagihan dibatalkan dan link Midtrans dinonaktifkan (sebaiknya). Orang tua tidak perlu membayar tagihan ini; Anda dapat membuat tagihan baru untuk bulan yang sama nanti."
        confirmLabel="Batalkan Tagihan"
        variant="destructive"
        onConfirm={handleCancel}
        isLoading={isProcessing}
      />
      <ConfirmDialog
        open={regenerateOpen}
        onOpenChange={setRegenerateOpen}
        title="Hitung Ulang Tagihan"
        description="Jumlah dan rincian mata pelajaran diperbarui dari data siswa saat ini. Link Midtrans lama dinonaktifkan dan link baru dibuat."
        confirmLabel="Hitung Ulang"
        onConfirm={handleRegenerate}
        isLoading={isProcessing}
      />
      <ConfirmDialog
        open={!!markManualReminderId}
        onOpenChange={(o) => { if (!o) setMarkManualReminderId(null) }}
        title="Tandai Terkirim Manual"
        description="Pengingat ini akan ditandai sebagai terkirim tanpa melalui WhatsApp otomatis. Gunakan jika Anda sudah mengirim link secara manual."
        confirmLabel="Tandai Terkirim"
        onConfirm={() => markManualReminderId && handleMarkManualSent(markManualReminderId)}
        isLoading={isProcessing}
      />
    </>
  )
}
