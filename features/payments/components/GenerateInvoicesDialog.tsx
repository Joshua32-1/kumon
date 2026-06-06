"use client"

import { useState } from "react"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { generateMonthlyAction } from "../actions"
import { getMonthName, currentMonthYearInCenterTimezone } from "@/lib/utils"

interface GenerateInvoicesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerated?: () => void
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const { month: defaultMonth, year: defaultYear } = currentMonthYearInCenterTimezone()
const YEARS = [defaultYear - 1, defaultYear, defaultYear + 1]

export function GenerateInvoicesDialog({
  open,
  onOpenChange,
  onGenerated,
}: GenerateInvoicesDialogProps) {
  const [month, setMonth] = useState(defaultMonth)
  const [year, setYear] = useState(defaultYear)
  const [isLoading, setIsLoading] = useState(false)

  async function handleGenerate() {
    setIsLoading(true)
    const result = await generateMonthlyAction({ month, year })
    setIsLoading(false)

    if ("error" in result && result.error) {
      toast.error("Terjadi kesalahan saat membuat tagihan.")
      return
    }

    const r = result.data
    const linksMsg =
      r?.payment_links_created != null
        ? ` ${r.payment_links_created} link Midtrans dibuat.`
        : ""
    const noSubjectsMsg =
      r?.skipped_no_subjects ? ` ${r.skipped_no_subjects} siswa belum ada mata pelajaran.` : ""
    const overdueMsg =
      r?.marked_overdue ? ` ${r.marked_overdue} tagihan lama ditandai terlambat.` : ""
    toast.success(
      `${r?.generated} tagihan dibuat. ${r?.skipped_on_leave} cuti, ${r?.skipped_existing} sudah ada.${noSubjectsMsg}${overdueMsg}${linksMsg}`
    )
    onOpenChange(false)
    onGenerated?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Buat Tagihan Bulanan</DialogTitle>
          <DialogDescription>
            Tagihan akan dibuat untuk semua siswa aktif yang tidak sedang cuti.
            Jumlah dihitung otomatis berdasarkan mata pelajaran dan tingkat sekolah.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Bulan</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
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
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Batal
          </Button>
          <Button onClick={handleGenerate} disabled={isLoading}>
            {isLoading ? "Membuat..." : "Buat Tagihan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
