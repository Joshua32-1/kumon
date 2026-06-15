"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import Link from "next/link"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { setLeaveAction } from "../actions"
import { getMonthName, currentMonthYearInCenterTimezone, formatRupiah } from "@/lib/utils"

interface LeaveDialogProps {
  studentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const { month: defaultMonth, year: defaultYear } = currentMonthYearInCenterTimezone()
const YEARS = [defaultYear - 1, defaultYear, defaultYear + 1]

type UnpaidInvoice = { id: string; amount: number; status: string }

export function LeaveDialog({ studentId, open, onOpenChange }: LeaveDialogProps) {
  const [month, setMonth] = useState<number>(defaultMonth)
  const [year, setYear] = useState<number>(defaultYear)
  const [reason, setReason] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [existingInvoice, setExistingInvoice] = useState<UnpaidInvoice | null>(null)
  const [paidInvoice, setPaidInvoice] = useState<UnpaidInvoice | null>(null)
  const [cancelInvoice, setCancelInvoice] = useState(true)

  // Fetch invoice for selected month/year whenever either changes (and dialog is open)
  useEffect(() => {
    if (!open) return
    setExistingInvoice(null)
    setPaidInvoice(null)
    setCancelInvoice(true)

    fetch(`/api/payments?student_id=${studentId}&month=${month}&year=${year}`)
      .then((r) => r.json())
      .then((r) => {
        const invoices: UnpaidInvoice[] = r.data ?? []
        const unpaid = invoices.find(
          (inv) => inv.status === "PENDING" || inv.status === "OVERDUE"
        )
        setExistingInvoice(unpaid ?? null)
        setPaidInvoice(invoices.find((inv) => inv.status === "PAID") ?? null)
      })
      .catch(() => {
        setExistingInvoice(null)
        setPaidInvoice(null)
      })
  }, [open, studentId, month, year])

  async function handleSubmit() {
    setIsLoading(true)
    try {
      const result = await setLeaveAction(
        studentId,
        month,
        year,
        reason || undefined,
        cancelInvoice
      )

      if ("error" in result && result.error) {
        toast.error("Cuti bulan ini sudah ada atau terjadi kesalahan.")
        return
      }

      const data = "data" in result ? result.data : null
      if (data && (data.cancel_error || data.failed_invoices.length > 0)) {
        toast.warning(
          `Cuti dicatat, tetapi tagihan gagal dibatalkan. Batalkan secara manual di halaman Pembayaran.`
        )
      } else if (data && data.cancelled_invoices.length > 0) {
        toast.success(
          `Cuti ${getMonthName(month)} ${year} dicatat. Tagihan bulan tersebut dibatalkan.`
        )
      } else {
        toast.success(`Cuti ${getMonthName(month)} ${year} berhasil dicatat.`)
      }
      onOpenChange(false)
      setReason("")
    } catch {
      toast.error(
        "Terjadi kesalahan saat mencatat cuti. Muat ulang halaman untuk memeriksa status cuti dan tagihan."
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Atur Cuti</DialogTitle>
          <DialogDescription>
            Siswa tidak akan dibuatkan tagihan untuk bulan yang dipilih.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Bulan</Label>
              <Select
                value={String(month)}
                onValueChange={(v) => setMonth(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {getMonthName(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tahun</Label>
              <Select
                value={String(year)}
                onValueChange={(v) => setYear(Number(v))}
              >
                <SelectTrigger>
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
            </div>
          </div>

          {existingInvoice && (
            <div className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-muted)] px-3 py-2.5 text-xs text-[var(--warning-foreground)] space-y-2">
              <p className="font-medium">
                Tagihan {getMonthName(month)} {year} ({formatRupiah(existingInvoice.amount)}) masih belum lunas.
              </p>
              <label className="flex cursor-pointer items-start gap-2">
                <Checkbox
                  checked={cancelInvoice}
                  onCheckedChange={(checked) => setCancelInvoice(checked === true)}
                />
                <span>
                  Batalkan tagihan {getMonthName(month)} {year} yang belum lunas
                </span>
              </label>
              {!cancelInvoice && (
                <p>
                  Setelah cuti dicatat, bebaskan atau batalkan tagihan secara manual.{" "}
                  <Link
                    href={`/payments/${existingInvoice.id}`}
                    className="underline hover:opacity-80"
                    onClick={() => onOpenChange(false)}
                  >
                    Lihat tagihan
                  </Link>
                </p>
              )}
            </div>
          )}

          {paidInvoice && (
            <div className="rounded-lg border border-border bg-muted px-3 py-2.5 text-xs text-muted-foreground space-y-1">
              <p>
                Tagihan {getMonthName(month)} {year} ({formatRupiah(paidInvoice.amount)}) sudah
                dibayar. Setelah cuti dicatat, tindak lanjuti pengembalian dana atau kredit —
                lihat panel di Dashboard.{" "}
                <Link
                  href={`/payments/${paidInvoice.id}`}
                  className="underline hover:opacity-80"
                  onClick={() => onOpenChange(false)}
                >
                  Lihat tagihan
                </Link>
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Alasan (opsional)</Label>
            <Textarea
              placeholder="Alasan cuti..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Menyimpan..." : "Simpan Cuti"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
