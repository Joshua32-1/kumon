"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/shared/LoadingSpinner"
import {
  listPaymentLinkSendCandidatesAction,
  sendPaymentLinksAction,
} from "../actions"
import { getMonthName } from "@/lib/utils"
import type { PaymentLinkSendCandidatesResult } from "../types"

interface SendPaymentLinksDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  month: number
  year: number
  onSent?: () => void
}

export function SendPaymentLinksDialog({
  open,
  onOpenChange,
  month,
  year,
  onSent,
}: SendPaymentLinksDialogProps) {
  const [preview, setPreview] = useState<PaymentLinkSendCandidatesResult | null>(
    null
  )
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    if (!open) return

    let cancelled = false

    async function loadPreview() {
      setIsLoading(true)
      setPreview(null)
      const result = await listPaymentLinkSendCandidatesAction({ month, year })
      if (cancelled) return
      setIsLoading(false)

      if ("error" in result && result.error) {
        toast.error("Gagal memuat daftar tagihan.")
        return
      }

      setPreview(result.data ?? null)
    }

    void loadPreview()
    return () => {
      cancelled = true
    }
  }, [open, month, year])

  async function handleSend() {
    if (!preview || preview.eligible === 0) {
      toast.error("Tidak ada link pembayaran yang perlu dikirim.")
      return
    }

    setIsSending(true)
    const result = await sendPaymentLinksAction({ month, year })
    setIsSending(false)

    if ("error" in result && result.error) {
      toast.error("Terjadi kesalahan saat mengirim link.")
      return
    }

    const r = result.data
    const truncatedMsg = r?.truncated
      ? " Batas batch tercapai — jalankan lagi untuk sisa tagihan."
      : ""
    const toastFn = r?.failed ? toast.warning : toast.success
    toastFn(
      `${r?.sent ?? 0} link terkirim, ${r?.failed ?? 0} gagal, ${r?.skipped ?? 0} dilewati.${truncatedMsg}`
    )
    onOpenChange(false)
    onSent?.()
  }

  const periodLabel = `${getMonthName(month)} ${year}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Kirim Link via WhatsApp</DialogTitle>
          <DialogDescription>
            Kirim link pembayaran ke orang tua untuk tagihan {periodLabel} yang
            belum dikirim. Menggunakan pesan pengingat yang sama dengan cron
            otomatis.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : preview ? (
          <div className="space-y-3 text-sm">
            <p>
              <span className="font-medium">{preview.eligible}</span> tagihan siap
              dikirim
              {preview.already_sent > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {preview.already_sent} sudah terkirim
                </span>
              )}
            </p>
            {preview.no_whatsapp > 0 && (
              <p className="text-muted-foreground">
                {preview.no_whatsapp} tagihan tanpa nomor WhatsApp — dilewati.
              </p>
            )}
            {preview.no_link > 0 && (
              <p className="text-muted-foreground">
                {preview.no_link} tagihan belum punya link — dilewati.
              </p>
            )}
            {preview.candidates.length > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 text-xs">
                {preview.candidates.map((c) => (
                  <li key={c.invoice_id}>{c.student_name}</li>
                ))}
              </ul>
            )}
            {preview.eligible === 0 && (
              <p className="text-muted-foreground">
                Semua link untuk periode ini sudah dikirim atau belum siap.
              </p>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            Batal
          </Button>
          <Button
            onClick={handleSend}
            disabled={isLoading || isSending || !preview || preview.eligible === 0}
          >
            {isSending ? "Mengirim..." : `Kirim ${preview?.eligible ?? 0} link`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
