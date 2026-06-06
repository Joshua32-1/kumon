"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SUBJECT_LABELS, SCHOOL_LEVEL_LABELS, ALL_SUBJECTS, parseSubjectFees } from "@/lib/billing/fees"
import type { KumonSubject } from "@/lib/billing/fees"

interface SettingsFormProps {
  initialConfig: Record<string, unknown>
}

function getStr(config: Record<string, unknown>, key: string, field: string): string {
  const val = config[key] as Record<string, string> | undefined
  return val?.[field] ?? ""
}

function getNum(config: Record<string, unknown>, key: string, field: string): number {
  const val = config[key] as Record<string, number> | undefined
  return val?.[field] ?? 0
}

export function SettingsForm({ initialConfig }: SettingsFormProps) {
  const [centerName, setCenterName] = useState(
    getStr(initialConfig, "center_name", "name")
  )
  const [maxLeaveMonths, setMaxLeaveMonths] = useState(
    String(getNum(initialConfig, "max_leave_months", "months"))
  )

  // Subject fees — 2 tiers × 3 subjects
  const parsedFees = parseSubjectFees(
    (initialConfig["subject_fees"] as Record<string, unknown>) ?? {}
  )
  const [elementaryFees, setElementaryFees] = useState<Record<Lowercase<KumonSubject>, string>>({
    english: String(parsedFees.elementary.english),
    indonesian: String(parsedFees.elementary.indonesian),
    mathematics: String(parsedFees.elementary.mathematics),
  })
  const [secondaryFees, setSecondaryFees] = useState<Record<Lowercase<KumonSubject>, string>>({
    english: String(parsedFees.secondary.english),
    indonesian: String(parsedFees.secondary.indonesian),
    mathematics: String(parsedFees.secondary.mathematics),
  })

  const [isLoading, setIsLoading] = useState(false)

  async function handleSave() {
    setIsLoading(true)

    const updates = [
      { key: "center_name", value: { name: centerName } },
      {
        key: "subject_fees",
        value: {
          elementary: {
            english: Number(elementaryFees.english),
            indonesian: Number(elementaryFees.indonesian),
            mathematics: Number(elementaryFees.mathematics),
          },
          secondary: {
            english: Number(secondaryFees.english),
            indonesian: Number(secondaryFees.indonesian),
            mathematics: Number(secondaryFees.mathematics),
          },
        },
      },
      { key: "max_leave_months", value: { months: Number(maxLeaveMonths) } },
    ]

    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    })

    setIsLoading(false)

    if (!res.ok) {
      toast.error("Gagal menyimpan pengaturan.")
      return
    }
    toast.success("Pengaturan berhasil disimpan.")
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informasi Center</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="center_name">Nama Center</Label>
            <Input
              id="center_name"
              value={centerName}
              onChange={(e) => setCenterName(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Biaya SPP per Mata Pelajaran</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-xs">
            Perubahan harga berlaku untuk tagihan baru. Tagihan yang sudah dibuat tidak berubah.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-muted-foreground py-2 pr-4 text-left font-medium">Tingkat</th>
                  {ALL_SUBJECTS.map((s) => (
                    <th key={s} className="text-muted-foreground py-2 px-2 text-left font-medium">
                      {SUBJECT_LABELS[s]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="py-2 pr-4 font-medium">{SCHOOL_LEVEL_LABELS.ELEMENTARY}</td>
                  {ALL_SUBJECTS.map((s) => {
                    const key = s.toLowerCase() as Lowercase<KumonSubject>
                    return (
                      <td key={s} className="py-2 px-2">
                        <Input
                          type="number"
                          className="w-32"
                          value={elementaryFees[key]}
                          onChange={(e) =>
                            setElementaryFees((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                        />
                      </td>
                    )
                  })}
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium">{SCHOOL_LEVEL_LABELS.SECONDARY}</td>
                  {ALL_SUBJECTS.map((s) => {
                    const key = s.toLowerCase() as Lowercase<KumonSubject>
                    return (
                      <td key={s} className="py-2 px-2">
                        <Input
                          type="number"
                          className="w-32"
                          value={secondaryFees[key]}
                          onChange={(e) =>
                            setSecondaryFees((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                        />
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aturan Cuti</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="max_leave">Maks. Bulan Cuti Berturut-turut</Label>
            <Input
              id="max_leave"
              type="number"
              value={maxLeaveMonths}
              onChange={(e) => setMaxLeaveMonths(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={isLoading}>
        {isLoading ? "Menyimpan..." : "Simpan Pengaturan"}
      </Button>
    </div>
  )
}
