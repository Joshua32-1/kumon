"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import Link from "next/link"
import useSWR from "swr"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { StudentStatusBadge } from "./StudentStatusBadge"
import { setLeaveBulkAction } from "../actions"
import { getMonthName, currentMonthYearInCenterTimezone, formatRupiah } from "@/lib/utils"
import { GRADE_LABELS } from "@/lib/billing/grades"
import type { StudentGrade } from "@/lib/billing/grades"
import type { Student, SetLeaveBulkResult } from "../types"

interface BulkLeaveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const fetcher = (url: string) => fetch(url).then((r) => r.json()).then((r) => r.data)

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const { month: defaultMonth, year: defaultYear } = currentMonthYearInCenterTimezone()
const YEARS = [defaultYear - 1, defaultYear, defaultYear + 1]

export function BulkLeaveDialog({ open, onOpenChange, onSuccess }: BulkLeaveDialogProps) {
  const [month, setMonth] = useState<number>(defaultMonth)
  const [year, setYear] = useState<number>(defaultYear)
  const [reason, setReason] = useState("")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [cancelInvoices, setCancelInvoices] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<SetLeaveBulkResult | null>(null)

  // Always fetch the full list — the students page list may be status-filtered.
  const { data: students = [], isLoading: isLoadingStudents } = useSWR<Student[]>(
    open ? "/api/students" : null,
    fetcher
  )

  useEffect(() => {
    if (open) return
    setMonth(defaultMonth)
    setYear(defaultYear)
    setReason("")
    setSearch("")
    setSelected(new Set())
    setCancelInvoices(true)
    setResult(null)
  }, [open])

  const eligible = students.filter((s) => s.status !== "INACTIVE")
  const query = search.trim().toLowerCase()
  const filtered = query
    ? eligible.filter((s) => s.full_name.toLowerCase().includes(query))
    : eligible

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const s of filtered) next.add(s.id)
      return next
    })
  }

  async function handleSubmit() {
    setIsLoading(true)
    try {
      const res = await setLeaveBulkAction({
        student_ids: Array.from(selected),
        month,
        year,
        reason: reason || undefined,
        cancel_unpaid_invoices: cancelInvoices,
      })
      if ("error" in res && res.error) {
        toast.error("Terjadi kesalahan saat mencatat cuti.")
        return
      }
      if ("data" in res && res.data) {
        setResult(res.data)
        onSuccess?.()
      }
    } catch {
      toast.error("Terjadi kesalahan saat mencatat cuti.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Atur Cuti Massal</DialogTitle>
          <DialogDescription>
            {result
              ? `Hasil pencatatan cuti ${getMonthName(month)} ${year}.`
              : "Catat cuti untuk beberapa siswa sekaligus. Siswa tidak akan dibuatkan tagihan untuk bulan yang dipilih."}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <p>
              <strong>{result.created}</strong> cuti {getMonthName(month)} {year} berhasil dicatat.
            </p>
            {result.skipped_existing > 0 && (
              <p className="text-muted-foreground">
                {result.skipped_existing} siswa dilewati (cuti {getMonthName(month)} {year} sudah
                ada).
              </p>
            )}
            {result.skipped_ineligible > 0 && (
              <p className="text-muted-foreground">
                {result.skipped_ineligible} siswa dilewati (tidak aktif).
              </p>
            )}
            {result.cancelled_invoices.length > 0 && (
              <p>
                <strong>{result.cancelled_invoices.length}</strong> tagihan{" "}
                {getMonthName(month)} {year} dibatalkan.
              </p>
            )}
            {result.paid_invoices.length > 0 && (
              <div className="rounded-lg border border-border bg-muted px-3 py-2.5 text-xs text-muted-foreground space-y-1">
                <p>
                  {result.paid_invoices.length} siswa sudah membayar tagihan{" "}
                  {getMonthName(month)} {year} — tindak lanjuti pengembalian dana atau kredit
                  (lihat panel di Dashboard):
                </p>
                <ul className="space-y-0.5">
                  {result.paid_invoices.map((inv) => (
                    <li key={inv.invoice_id}>
                      <Link
                        href={`/payments/${inv.invoice_id}`}
                        className="underline hover:opacity-80"
                        onClick={() => onOpenChange(false)}
                      >
                        {inv.student_name} ({formatRupiah(inv.amount)})
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.unpaid_invoices.length > 0 && (
              <div className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-muted)] px-3 py-2.5 text-xs text-[var(--warning-foreground)] space-y-1">
                <p className="font-medium">
                  {result.unpaid_invoices.length} siswa masih memiliki tagihan{" "}
                  {getMonthName(month)} {year} yang belum lunas. Bebaskan atau batalkan tagihan
                  secara manual:
                </p>
                <ul className="space-y-0.5">
                  {result.unpaid_invoices.map((inv) => (
                    <li key={inv.invoice_id}>
                      <Link
                        href={`/payments/${inv.invoice_id}`}
                        className="underline hover:opacity-80"
                        onClick={() => onOpenChange(false)}
                      >
                        {inv.student_name} ({formatRupiah(inv.amount)})
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
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

            <div className="space-y-1.5">
              <Label>Siswa ({selected.size} dipilih)</Label>
              <Input
                placeholder="Cari nama siswa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="flex gap-3 text-xs">
                <button
                  type="button"
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={selectAllFiltered}
                >
                  Pilih semua
                </button>
                <button
                  type="button"
                  className="text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setSelected(new Set())}
                >
                  Hapus pilihan
                </button>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {isLoadingStudents ? (
                  <p className="px-1 py-2 text-xs text-muted-foreground">Memuat siswa...</p>
                ) : filtered.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-muted-foreground">
                    Tidak ada siswa yang cocok.
                  </p>
                ) : (
                  filtered.map((s) => (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent"
                    >
                      <Checkbox
                        checked={selected.has(s.id)}
                        onCheckedChange={(checked) => toggle(s.id, checked === true)}
                      />
                      <span className="flex-1 truncate text-sm">{s.full_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {GRADE_LABELS[s.grade as StudentGrade] ?? s.grade}
                      </span>
                      <StudentStatusBadge status={s.status} />
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Alasan (opsional)</Label>
              <Textarea
                placeholder="Alasan cuti..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox
                checked={cancelInvoices}
                onCheckedChange={(checked) => setCancelInvoices(checked === true)}
              />
              <span>
                Batalkan tagihan {getMonthName(month)} {year} yang belum lunas
              </span>
            </label>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>Selesai</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                Batal
              </Button>
              <Button onClick={handleSubmit} disabled={isLoading || selected.size === 0}>
                {isLoading ? "Menyimpan..." : `Catat Cuti (${selected.size} siswa)`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
