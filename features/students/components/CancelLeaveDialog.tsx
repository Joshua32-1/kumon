"use client"

import { useState, useEffect } from "react"
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
import { Checkbox } from "@/components/ui/checkbox"
import { cancelLeaveAction } from "../actions"
import {
  getMonthName,
  currentMonthYearInCenterTimezone,
  isPriorBillingPeriod,
} from "@/lib/utils"

interface CancelLeaveDialogProps {
  studentId: string
  leave: { id: string; month: number; year: number } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}

type InvoiceRow = { id: string; status: string }

// Statuses outside the partial unique index — an invoice in one of these does
// not block regenerating an active invoice for the same month.
const INACTIVE_STATUSES = ["CANCELLED", "PAID_OLD_LINK"]

export function CancelLeaveDialog({
  studentId,
  leave,
  open,
  onOpenChange,
  onDone,
}: CancelLeaveDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [canRegenerate, setCanRegenerate] = useState(false)
  const [regenerate, setRegenerate] = useState(true)

  useEffect(() => {
    if (!open || !leave) return
    setCanRegenerate(false)
    setRegenerate(true)

    const current = currentMonthYearInCenterTimezone()
    if (isPriorBillingPeriod(leave.month, leave.year, current.month, current.year)) {
      return
    }

    fetch(`/api/payments?student_id=${studentId}&month=${leave.month}&year=${leave.year}`)
      .then((r) => r.json())
      .then((r) => {
        const invoices: InvoiceRow[] = r.data ?? []
        const hasCancelled = invoices.some((inv) => inv.status === "CANCELLED")
        const hasActive = invoices.some(
          (inv) => !INACTIVE_STATUSES.includes(inv.status)
        )
        setCanRegenerate(hasCancelled && !hasActive)
      })
      .catch(() => setCanRegenerate(false))
  }, [open, studentId, leave])

  if (!leave) return null

  const monthLabel = `${getMonthName(leave.month)} ${leave.year}`

  async function handleConfirm() {
    if (!leave) return
    setIsLoading(true)
    try {
      const result = await cancelLeaveAction(leave.id, studentId, {
        regenerate_invoice: canRegenerate && regenerate,
      })

      if ("error" in result && result.error) {
        toast.error("Cuti tidak ditemukan atau terjadi kesalahan.")
        return
      }

      const data = "data" in result ? result.data : null
      if (data?.regenerated_invoice_id) {
        toast.success(`Cuti dibatalkan. Tagihan ${monthLabel} dibuat ulang.`)
      } else if (
        canRegenerate &&
        regenerate &&
        (data?.regenerate_error || data?.regenerate_skipped_reason)
      ) {
        toast.warning(
          "Cuti dibatalkan, tetapi tagihan gagal dibuat ulang. Buat tagihan manual dari halaman Pembayaran."
        )
      } else {
        toast.success("Cuti dibatalkan.")
      }
      onOpenChange(false)
      onDone()
    } catch {
      toast.error("Terjadi kesalahan saat membatalkan cuti.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Batalkan Cuti</DialogTitle>
          <DialogDescription>
            Yakin ingin membatalkan cuti {monthLabel}? Siswa kembali dapat ditagih untuk
            bulan tersebut.
          </DialogDescription>
        </DialogHeader>

        {canRegenerate && (
          <div className="rounded-lg border border-border bg-muted px-3 py-2.5 text-xs text-muted-foreground space-y-2">
            <label className="flex cursor-pointer items-start gap-2">
              <Checkbox
                checked={regenerate}
                onCheckedChange={(checked) => setRegenerate(checked === true)}
              />
              <span>
                Buat ulang tagihan {monthLabel}. Tagihan yang dibatalkan saat cuti akan
                dibuat baru dengan link pembayaran baru.
              </span>
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Batal
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? "Menyimpan..." : "Batalkan Cuti"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
