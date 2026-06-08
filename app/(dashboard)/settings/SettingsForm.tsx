"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SUBJECT_LABELS, SCHOOL_LEVEL_LABELS, ALL_SUBJECTS, parseSubjectFees } from "@/lib/billing/fees"
import type { KumonSubject } from "@/lib/billing/fees"
import {
  CRON_JOBS,
  parseCronJobsConfig,
  serializeCronJobsConfig,
  type CronJobId,
} from "@/lib/cron/jobs"

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

  const parsedCronJobs = parseCronJobsConfig(initialConfig["cron_jobs"])
  const [cronJobsEnabled, setCronJobsEnabled] = useState<Record<CronJobId, boolean>>(
    Object.fromEntries(
      CRON_JOBS.map(({ id }) => [id, parsedCronJobs[id].enabled])
    ) as Record<CronJobId, boolean>
  )

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
      { key: "cron_jobs", value: serializeCronJobsConfig(cronJobsEnabled) },
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
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Informasi Center</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
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
          <CardTitle>Biaya SPP per Mata Pelajaran</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-muted)] px-4 py-3 text-sm text-[var(--warning-foreground)]">
            <p className="font-medium">Tarif baru berlaku sejak bulan ini</p>
            <p className="text-[var(--warning-foreground)]/90">
              Jika Anda menyimpan perubahan di tengah bulan, tarif baru dipakai untuk tagihan
              bulan berjalan dan bulan-bulan setelahnya — bukan hanya mulai bulan depan.
            </p>
            <p className="text-[var(--warning-foreground)]/90">
              Tagihan yang sudah dibuat sebelumnya tidak berubah otomatis. Hanya tagihan baru
              atau tagihan yang dihitung ulang (belum lunas) yang memakai tarif terbaru.
            </p>
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tingkat</TableHead>
                  {ALL_SUBJECTS.map((s) => (
                    <TableHead key={s}>{SUBJECT_LABELS[s]}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">{SCHOOL_LEVEL_LABELS.ELEMENTARY}</TableCell>
                  {ALL_SUBJECTS.map((s) => {
                    const key = s.toLowerCase() as Lowercase<KumonSubject>
                    return (
                      <TableCell key={s}>
                        <Input
                          type="number"
                          className="w-32"
                          value={elementaryFees[key]}
                          onChange={(e) =>
                            setElementaryFees((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                        />
                      </TableCell>
                    )
                  })}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">{SCHOOL_LEVEL_LABELS.SECONDARY}</TableCell>
                  {ALL_SUBJECTS.map((s) => {
                    const key = s.toLowerCase() as Lowercase<KumonSubject>
                    return (
                      <TableCell key={s}>
                        <Input
                          type="number"
                          className="w-32"
                          value={secondaryFees[key]}
                          onChange={(e) =>
                            setSecondaryFees((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                        />
                      </TableCell>
                    )
                  })}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aturan Cuti</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
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

      <Card>
        <CardHeader>
          <CardTitle>Tugas Terjadwal (Cron)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Aktifkan atau nonaktifkan otomatisasi yang dijalankan oleh scheduler Vercel.
            Tugas yang dinonaktifkan akan dilewati saat cron dipanggil.
          </p>
          <div className="space-y-4">
            {CRON_JOBS.map((job) => (
              <div
                key={job.id}
                className="flex items-start gap-3 rounded-lg border border-border p-4"
              >
                <Checkbox
                  id={`cron_${job.id}`}
                  checked={cronJobsEnabled[job.id]}
                  onCheckedChange={(checked) =>
                    setCronJobsEnabled((prev) => ({
                      ...prev,
                      [job.id]: checked === true,
                    }))
                  }
                  className="mt-0.5"
                />
                <div className="space-y-1">
                  <Label htmlFor={`cron_${job.id}`} className="cursor-pointer font-medium">
                    {job.label}
                  </Label>
                  <p className="text-sm text-muted-foreground">{job.description}</p>
                  <p className="text-xs text-muted-foreground">{job.schedule}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Separator />

      <Button onClick={handleSave} disabled={isLoading} className="h-10 px-6">
        {isLoading ? "Menyimpan..." : "Simpan Pengaturan"}
      </Button>
    </div>
  )
}
