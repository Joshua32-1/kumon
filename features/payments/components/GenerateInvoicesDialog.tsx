"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { LoadingSpinner } from "@/components/shared/LoadingSpinner"
import { generateMonthlyAction, listGenerateCandidatesAction } from "../actions"
import { getMonthName, currentMonthYearInCenterTimezone } from "@/lib/utils"
import {
  DEFAULT_GENERATE_CATEGORIES,
  type GenerateCandidate,
  type GenerateInvoiceCategory,
  type GeneratePeriodInfo,
} from "../types"

interface GenerateInvoicesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerated?: () => void
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const { month: defaultMonth, year: defaultYear } = currentMonthYearInCenterTimezone()
const YEARS = [defaultYear - 1, defaultYear, defaultYear + 1]

const CATEGORY_OPTIONS: { value: GenerateInvoiceCategory; label: string }[] = [
  { value: "no_invoice", label: "Belum ada tagihan" },
  { value: "CANCELLED", label: "Dibatalkan" },
  { value: "PAID_OLD_LINK", label: "Lunas (link lama)" },
  { value: "PENDING", label: "Belum bayar" },
  { value: "OVERDUE", label: "Terlambat" },
  { value: "PAID", label: "Lunas" },
  { value: "WAIVED", label: "Dibebaskan" },
]

function candidateCategory(candidate: GenerateCandidate): GenerateInvoiceCategory {
  return candidate.invoice_status ?? "no_invoice"
}

function isVisibleCandidate(
  candidate: GenerateCandidate,
  categories: GenerateInvoiceCategory[]
): boolean {
  return categories.includes(candidateCategory(candidate))
}

export function GenerateInvoicesDialog({
  open,
  onOpenChange,
  onGenerated,
}: GenerateInvoicesDialogProps) {
  const [month, setMonth] = useState(defaultMonth)
  const [year, setYear] = useState(defaultYear)
  const [categories, setCategories] = useState<GenerateInvoiceCategory[]>(
    DEFAULT_GENERATE_CATEGORIES
  )
  const [candidates, setCandidates] = useState<GenerateCandidate[]>([])
  const [periodInfo, setPeriodInfo] = useState<GeneratePeriodInfo | null>(null)
  const [acknowledgePastPeriod, setAcknowledgePastPeriod] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const categoriesRef = useRef(categories)
  categoriesRef.current = categories

  useEffect(() => {
    if (!open) return

    let cancelled = false

    async function loadCandidates() {
      setIsLoadingCandidates(true)
      const result = await listGenerateCandidatesAction({ month, year })
      if (cancelled) return
      setIsLoadingCandidates(false)

      if ("error" in result && result.error) {
        toast.error("Gagal memuat daftar siswa.")
        return
      }

      const payload = result.data
      const rows = payload?.candidates ?? []
      const activeCategories = categoriesRef.current
      setPeriodInfo(payload?.period ?? null)
      setAcknowledgePastPeriod(false)
      setCandidates(rows)
      setSelectedIds(
        new Set(
          rows
            .filter(
              (c) =>
                c.can_generate &&
                activeCategories.includes(candidateCategory(c))
            )
            .map((c) => c.student_id)
        )
      )
    }

    void loadCandidates()
    return () => {
      cancelled = true
    }
  }, [open, month, year])

  useEffect(() => {
    if (open) {
      setSearch("")
      setCategories(DEFAULT_GENERATE_CATEGORIES)
      setAcknowledgePastPeriod(false)
    }
  }, [open])

  useEffect(() => {
    setAcknowledgePastPeriod(false)
  }, [month, year])

  const visibleCandidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return candidates.filter((c) => {
      if (!isVisibleCandidate(c, categories)) return false
      if (!q) return true
      return c.full_name.toLowerCase().includes(q)
    })
  }, [candidates, categories, search])

  const selectableVisible = useMemo(
    () => visibleCandidates.filter((c) => c.can_generate),
    [visibleCandidates]
  )

  const allSelectableChecked =
    selectableVisible.length > 0 &&
    selectableVisible.every((c) => selectedIds.has(c.student_id))

  function toggleCategory(category: GenerateInvoiceCategory) {
    setCategories((prev) => {
      const next = prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
      return next
    })
  }

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>()
      for (const id of prev) {
        const candidate = candidates.find((c) => c.student_id === id)
        if (
          candidate?.can_generate &&
          isVisibleCandidate(candidate, categories)
        ) {
          next.add(id)
        }
      }
      return next
    })
  }, [categories, candidates])

  function toggleStudent(studentId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  function toggleSelectAll() {
    if (allSelectableChecked) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(selectableVisible.map((c) => c.student_id)))
  }

  async function handleGenerate() {
    if (selectedIds.size === 0) {
      toast.error("Pilih minimal satu siswa.")
      return
    }

    if (periodInfo?.is_past && !acknowledgePastPeriod) {
      toast.error("Konfirmasi pembuatan tagihan untuk periode lampau.")
      return
    }

    setIsGenerating(true)
    const result = await generateMonthlyAction({
      month,
      year,
      categories,
      student_ids: [...selectedIds],
    })
    setIsGenerating(false)

    if ("error" in result && result.error) {
      toast.error("Terjadi kesalahan saat membuat tagihan.")
      return
    }

    const r = result.data
    const linksMsg =
      r?.payment_links_created != null
        ? ` ${r.payment_links_created} link Midtrans dibuat.`
        : ""
    const failedLinksMsg =
      r?.payment_links_failed
        ? ` ${r.payment_links_failed} link gagal — akan dicoba ulang otomatis.`
        : ""
    const noSubjectsMsg =
      r?.skipped_no_subjects ? ` ${r.skipped_no_subjects} siswa belum ada mata pelajaran.` : ""
    const overdueMsg =
      r?.marked_overdue ? ` ${r.marked_overdue} tagihan lama ditandai terlambat.` : ""
    const beforeEnrollmentMsg =
      r?.skipped_before_enrollment ? ` ${r.skipped_before_enrollment} belum terdaftar.` : ""
    const toastFn = r?.payment_links_failed ? toast.warning : toast.success
    toastFn(
      `${r?.generated} tagihan dibuat. ${r?.skipped_on_leave} cuti, ${r?.skipped_existing} sudah ada.${beforeEnrollmentMsg}${noSubjectsMsg}${overdueMsg}${linksMsg}${failedLinksMsg}`
    )
    onOpenChange(false)
    onGenerated?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Buat Tagihan Bulanan</DialogTitle>
          <DialogDescription>
            Pilih periode dan siswa. Jumlah dihitung otomatis berdasarkan mata
            pelajaran dan tingkat sekolah.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
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

          {periodInfo?.is_past && (
            <div className="space-y-3 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-muted)] px-4 py-3 text-sm text-[var(--warning-foreground)]">
              <p className="font-medium">Periode lampau</p>
              <p>
                Anda membuat tagihan untuk {getMonthName(month)} {year}. Jatuh tempo
                dan pengingat otomatis mungkin sudah lewat. Pastikan roster dan tarif
                sudah benar sebelum melanjutkan.
              </p>
              <label className="flex cursor-pointer items-start gap-2">
                <Checkbox
                  checked={acknowledgePastPeriod}
                  onCheckedChange={(v) => setAcknowledgePastPeriod(v === true)}
                  className="mt-0.5"
                />
                <span>Saya mengerti dan ingin melanjutkan untuk periode ini.</span>
              </label>
            </div>
          )}

          {periodInfo?.fee_effective_month != null && periodInfo.fee_effective_year != null && (
            <p className="text-xs text-muted-foreground">
              Tarif SPP efektif untuk periode ini:{" "}
              <span className="font-medium text-foreground">
                {getMonthName(periodInfo.fee_effective_month)}{" "}
                {periodInfo.fee_effective_year}
              </span>
              {" "}ke atas (bukan tarif pengaturan terbaru jika berbeda).
            </p>
          )}

          <div className="space-y-2">
            <Label>Filter status tagihan</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {CATEGORY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={categories.includes(opt.value)}
                    onCheckedChange={() => toggleCategory(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Siswa ({selectedIds.size} dipilih)</Label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={allSelectableChecked}
                  onCheckedChange={toggleSelectAll}
                  disabled={selectableVisible.length === 0}
                />
                Pilih semua
              </label>
            </div>
            <Input
              placeholder="Cari nama siswa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-64 overflow-y-auto rounded-lg border">
              {isLoadingCandidates ? (
                <div className="flex items-center justify-center py-10">
                  <LoadingSpinner />
                </div>
              ) : visibleCandidates.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Tidak ada siswa untuk filter ini.
                </p>
              ) : (
                <ul className="divide-y">
                  {visibleCandidates.map((candidate) => {
                    const statusKey = candidate.invoice_status ?? "no_invoice"
                    const disabled = !candidate.can_generate
                    const disabledReason = candidate.before_enrollment
                      ? "Belum terdaftar di periode ini"
                      : candidate.on_leave
                      ? "Sedang cuti"
                      : !candidate.has_subjects
                        ? "Belum ada mata pelajaran aktif"
                        : "Sudah punya tagihan aktif"

                    return (
                      <li key={candidate.student_id}>
                        <label
                          className={`flex items-center gap-3 px-3 py-2.5 ${
                            disabled
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer hover:bg-muted/50"
                          }`}
                        >
                          <Checkbox
                            checked={selectedIds.has(candidate.student_id)}
                            onCheckedChange={() => toggleStudent(candidate.student_id)}
                            disabled={disabled}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {candidate.full_name}
                          </span>
                          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                            {candidate.on_leave && (
                              <StatusBadge status="on_leave" />
                            )}
                            <StatusBadge status={statusKey} />
                            {disabled && (
                              <span className="text-xs text-muted-foreground">
                                {disabledReason}
                              </span>
                            )}
                          </div>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            Batal
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={
              isGenerating ||
              isLoadingCandidates ||
              selectedIds.size === 0 ||
              (periodInfo?.is_past === true && !acknowledgePastPeriod)
            }
          >
            {isGenerating
              ? "Membuat..."
              : `Buat Tagihan (${selectedIds.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
