export const CRON_JOBS_CONFIG_KEY = "cron_jobs"

export const CRON_JOB_IDS = [
  "generate_invoices",
  "backfill_payment_links",
  "send_reminders",
  "reconcile_payments",
  "promote_grades",
  "sync_leave_status",
] as const

export type CronJobId = (typeof CRON_JOB_IDS)[number]

export interface CronJobDefinition {
  id: CronJobId
  label: string
  description: string
  schedule: string
}

export const CRON_JOBS: CronJobDefinition[] = [
  {
    id: "generate_invoices",
    label: "Generate Tagihan Bulanan",
    description: "Membuat tagihan SPP otomatis untuk semua siswa aktif.",
    schedule: "Tanggal 1 setiap bulan, 07:00 WIB",
  },
  {
    id: "backfill_payment_links",
    label: "Backfill Link Pembayaran",
    description: "Menambahkan token link pembayaran pada tagihan yang belum memilikinya.",
    schedule: "Setiap hari, 07:30 WIB",
  },
  {
    id: "send_reminders",
    label: "Kirim Pengingat WhatsApp",
    description: "Mengirim pengingat pembayaran ke orang tua pada hari jatuh tempo.",
    schedule: "Tanggal 1, 11, 21 — 09:00–13:30 WIB",
  },
  {
    id: "reconcile_payments",
    label: "Rekonsiliasi Midtrans",
    description: "Memeriksa status pembayaran Midtrans untuk tagihan yang belum lunas.",
    schedule: "Setiap hari, 22:00 WIB",
  },
  {
    id: "promote_grades",
    label: "Kenaikan Kelas Tahunan",
    description: "Menaikkan kelas siswa aktif pada awal tahun ajaran.",
    schedule: "1 Juli, 00:00 WIB",
  },
  {
    id: "sync_leave_status",
    label: "Sinkronisasi Status Cuti",
    description: "Memperbarui status siswa (Aktif/Cuti) sesuai catatan cuti bulan berjalan.",
    schedule: "Setiap hari, 00:15 WIB",
  },
]

export type CronJobsConfig = Record<CronJobId, { enabled: boolean }>

export function defaultCronJobsConfig(): CronJobsConfig {
  return Object.fromEntries(
    CRON_JOB_IDS.map((id) => [id, { enabled: true }])
  ) as CronJobsConfig
}

export function parseCronJobsConfig(raw: unknown): CronJobsConfig {
  const defaults = defaultCronJobsConfig()
  if (!raw || typeof raw !== "object") return defaults

  const source = raw as Record<string, unknown>
  const merged = { ...defaults }

  for (const id of CRON_JOB_IDS) {
    const entry = source[id]
    if (entry && typeof entry === "object" && "enabled" in entry) {
      merged[id] = { enabled: Boolean((entry as { enabled: unknown }).enabled) }
    }
  }

  return merged
}

export function serializeCronJobsConfig(
  enabledById: Record<CronJobId, boolean>
): CronJobsConfig {
  return Object.fromEntries(
    CRON_JOB_IDS.map((id) => [id, { enabled: enabledById[id] }])
  ) as CronJobsConfig
}
