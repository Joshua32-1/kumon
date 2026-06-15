"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { resolvePaidLeaveConflictAction } from "../actions"
import type { PaidLeaveConflict } from "../types"
import { getMonthName, formatRupiah } from "@/lib/utils"

interface PaidLeaveConflictPanelProps {
  conflicts: PaidLeaveConflict[]
}

export function PaidLeaveConflictPanel({ conflicts }: PaidLeaveConflictPanelProps) {
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<PaidLeaveConflict | null>(null)

  if (conflicts.length === 0) return null

  async function handleResolve(invoiceId: string) {
    setResolvingId(invoiceId)
    try {
      const result = await resolvePaidLeaveConflictAction(invoiceId)
      if ("error" in result && result.error) {
        toast.error(
          typeof result.error === "string" ? result.error : "Gagal menandai konflik selesai."
        )
        return
      }
      toast.success("Konflik ditandai selesai.")
    } catch {
      toast.error("Gagal menandai konflik selesai.")
    } finally {
      setResolvingId(null)
      setConfirmTarget(null)
    }
  }

  return (
    <Card className="border-[var(--warning-border)] bg-[var(--warning-muted)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium text-[var(--warning-foreground)]">
          Tagihan sudah dibayar untuk bulan cuti
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-[var(--warning-foreground)]/80">
          Orang tua membayar untuk bulan cuti. Tandai selesai setelah pengembalian dana
          atau kredit ditindaklanjuti.
        </p>
        <ul className="divide-y rounded-lg border divide-[var(--warning-border)] border-[var(--warning-border)] bg-card">
          {conflicts.map((conflict) => (
            <li
              key={conflict.invoice_id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <Link
                href={`/payments/${conflict.invoice_id}`}
                className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 transition-opacity hover:opacity-80"
              >
                <span className="font-medium text-[var(--warning-foreground)]">
                  {conflict.student_name}
                </span>
                <span className="text-xs text-[var(--warning)]">
                  {getMonthName(conflict.month)} {conflict.year} ·{" "}
                  {formatRupiah(conflict.amount)}
                </span>
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={resolvingId === conflict.invoice_id}
                onClick={() => setConfirmTarget(conflict)}
              >
                {resolvingId === conflict.invoice_id ? "Menyimpan..." : "Tandai selesai"}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmTarget(null)
        }}
        title="Tandai konflik selesai?"
        description={
          confirmTarget
            ? `Pastikan pengembalian dana atau kredit untuk ${confirmTarget.student_name} (${getMonthName(confirmTarget.month)} ${confirmTarget.year}) sudah ditindaklanjuti. Konflik akan hilang dari panel dan tidak bisa dikembalikan.`
            : ""
        }
        confirmLabel="Ya, tandai selesai"
        isLoading={resolvingId !== null}
        onConfirm={() => {
          if (confirmTarget) handleResolve(confirmTarget.invoice_id)
        }}
      />
    </Card>
  )
}
