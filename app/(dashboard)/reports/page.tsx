import { PageHeader } from "@/components/shared/PageHeader"
import { KpiCard } from "@/components/shared/KpiCard"
import { CollectionRateChart } from "@/components/reports/CollectionRateChart"
import { EnrollmentChurnChart } from "@/components/reports/EnrollmentChurnChart"
import { PaymentLedgerExport } from "@/components/reports/PaymentLedgerExport"
import { reportsService } from "@/features/reports/service"
import { formatRupiah } from "@/lib/utils"

export default async function ReportsPage() {
  const [aging, subjectMix] = await Promise.all([
    reportsService.arrearsAging(),
    reportsService.subjectMix(),
  ])

  return (
    <>
      <PageHeader
        title="Laporan"
        description="Ringkasan penagihan, tunggakan, dan keanggotaan"
      />

      <div className="space-y-6">
        <CollectionRateChart />

        <div>
          <h2 className="mb-4 font-heading text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Umur Tunggakan
          </h2>
          {aging.count === 0 ? (
            <p className="text-sm text-muted-foreground">
              Tidak ada tagihan yang menunggak. 🎉
            </p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {aging.buckets.map((bucket) => (
                <KpiCard
                  key={bucket.key}
                  title={bucket.label}
                  value={formatRupiah(bucket.totalAmount)}
                  description={`${bucket.count} tagihan`}
                  highlight={bucket.key === "90+" && bucket.count > 0}
                />
              ))}
            </div>
          )}
        </div>

        <EnrollmentChurnChart />

        <div>
          <h2 className="mb-4 font-heading text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Komposisi Mata Pelajaran
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              title="Total Siswa Aktif"
              value={subjectMix.totalStudents}
              description={subjectMix.byLevel
                .map((l) => `${l.label}: ${l.count}`)
                .join(" · ")}
            />
            {subjectMix.bySubject.map((s) => (
              <KpiCard
                key={s.subject}
                title={s.label}
                value={s.count}
                description="siswa terdaftar"
              />
            ))}
          </div>
        </div>

        <PaymentLedgerExport />
      </div>
    </>
  )
}
