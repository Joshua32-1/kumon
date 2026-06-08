import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { studentService } from "@/features/students/service"
import { PageHeader } from "@/components/shared/PageHeader"
import { KpiCard } from "@/components/shared/KpiCard"
import { AlertPanel } from "@/components/shared/AlertPanel"
import { RevenueChart } from "@/components/dashboard/RevenueChart"
import { leaveReviewSummary } from "@/lib/billing/leave-review-label"
import { summarizeArrears } from "@/lib/billing/arrears"
import { getBillingSummary } from "@/features/payments/billing-summary"
import {
  formatRupiah,
  getMonthName,
  todayInCenterTimezone,
  currentMonthYearInCenterTimezone,
} from "@/lib/utils"
import type { Invoice, PaymentReminder } from "@/features/payments/types"

async function getDashboardStats() {
  const supabase = await createSupabaseServerClient()
  const { month, year } = currentMonthYearInCenterTimezone()
  const today = todayInCenterTimezone()

  const [
    { count: activeStudents },
    { data: paidInvoices },
    { count: temporaryLeave },
    { data: allUnpaidRows },
    { count: paidOldLinkCount },
  ] = await Promise.all([
    supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("status", "ACTIVE"),
    supabase
      .from("invoices")
      .select("amount")
      .eq("status", "PAID")
      .eq("month", month)
      .eq("year", year)
      .returns<{ amount: number }[]>(),
    supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("status", "TEMPORARY_LEAVE"),
    supabase
      .from("invoices")
      .select("id, student_id, month, year, amount, status, due_date, payment_access_token, payment_reminders(status, scheduled_date)")
      .in("status", ["PENDING", "OVERDUE"]),
    supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .eq("status", "PAID_OLD_LINK"),
  ])

  const monthlyRevenue = (paidInvoices ?? []).reduce(
    (sum, inv) => sum + inv.amount,
    0
  )

  let needsActionCount = 0
  for (const inv of allUnpaidRows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invAny = inv as any
    const reminders: PaymentReminder[] = invAny.payment_reminders ?? []
    if (invAny.month === month && invAny.year === year) {
      const summary = getBillingSummary(invAny as Invoice, reminders, today)
      if (summary.attention === "needs_action") needsActionCount++
    }
  }

  const allInvoices = (allUnpaidRows ?? []) as unknown as Invoice[]
  const arrears = summarizeArrears(allInvoices, today)

  return {
    activeStudents: activeStudents ?? 0,
    unpaidInvoices: allInvoices.length,
    monthlyRevenue,
    temporaryLeave: temporaryLeave ?? 0,
    needsActionCount,
    paidOldLinkCount: paidOldLinkCount ?? 0,
    arrears,
    currentMonth: getMonthName(month),
    currentYear: year,
  }
}

export default async function DashboardPage() {
  const [stats, leaveReview] = await Promise.all([
    getDashboardStats(),
    studentService.listLeaveReviewAlerts(),
  ])

  const operationalCards = [
    {
      title: "Siswa Aktif",
      value: stats.activeStudents,
      description: "Total siswa berstatus aktif",
      highlight: false,
      href: null,
    },
    {
      title: "Tagihan Belum Lunas",
      value: stats.unpaidInvoices,
      description: "Tagihan pending + overdue (semua bulan)",
      highlight: stats.unpaidInvoices > 0,
      href: "/payments?view=arrears",
    },
    {
      title: `Pendapatan ${stats.currentMonth} ${stats.currentYear}`,
      value: formatRupiah(stats.monthlyRevenue),
      description: "Total pembayaran lunas bulan ini",
      highlight: false,
      href: null,
    },
    {
      title: "Siswa Cuti",
      value: stats.temporaryLeave,
      description: "Sedang dalam status cuti sementara",
      highlight: false,
      href: "/students?status=TEMPORARY_LEAVE",
    },
  ]

  const attentionCards = [
    {
      title: "Cuti Perlu Review",
      value: leaveReview.students.length,
      description: `${leaveReview.max_consecutive_months}+ bulan cuti berturut-turut — pertimbangkan nonaktifkan`,
      highlight: leaveReview.students.length > 0,
      href: leaveReview.students.length > 0 ? "/students?status=TEMPORARY_LEAVE" : null,
    },
    {
      title: "Perlu Tindakan",
      value: stats.needsActionCount,
      description: `Tagihan ${stats.currentMonth} yang belum terkirim, gagal, atau menunggak`,
      highlight: stats.needsActionCount > 0,
      href: "/payments?attention=1",
    },
    {
      title: "Tunggakan",
      value: stats.arrears.count > 0
        ? `${stats.arrears.count} tagihan · ${formatRupiah(stats.arrears.totalAmount)}`
        : "Tidak ada",
      description: "Tagihan lewat jatuh tempo belum lunas (lintas bulan)",
      highlight: stats.arrears.count > 0,
      href: stats.arrears.count > 0 ? "/payments?view=arrears" : null,
    },
    {
      title: "Pembayaran Link Lama",
      value: stats.paidOldLinkCount,
      description: "Perlu hubungi orang tua (bayar link yang sudah tidak berlaku)",
      highlight: stats.paidOldLinkCount > 0,
      href: "/payments?status=PAID_OLD_LINK",
    },
  ]

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Ringkasan operasional ${stats.currentMonth} ${stats.currentYear}`}
      />

      {leaveReview.students.length > 0 && (
        <AlertPanel
          variant="warning"
          title={`Siswa cuti ${leaveReview.max_consecutive_months}+ bulan berturut-turut`}
          description={
            <>
              Batas di Pengaturan adalah bulan cuti <strong>berurutan</strong>, bukan total.
              Review apakah siswa perlu dinonaktifkan.
            </>
          }
          items={leaveReview.students.map((s) => ({
            key: s.id,
            href: `/students/${s.id}`,
            primary: s.full_name,
            secondary: leaveReviewSummary(s),
          }))}
        />
      )}

      {stats.arrears.byPeriod.length > 0 && (
        <AlertPanel
          variant="danger"
          title={`Tunggakan ${stats.arrears.count} tagihan — ${formatRupiah(stats.arrears.totalAmount)}`}
          description="Tagihan melewati jatuh tempo dan belum lunas. Cron mengirim pengingat pada tanggal 1, 11, 21."
          items={stats.arrears.byPeriod.slice(0, 5).map((p) => ({
            key: `${p.year}-${p.month}`,
            href: `/payments?view=arrears&month=${p.month}&year=${p.year}`,
            primary: `${getMonthName(p.month)} ${p.year}`,
            secondary: `${p.count} siswa · ${formatRupiah(p.totalAmount)}`,
          }))}
          footer={
            stats.arrears.byPeriod.length > 5 ? (
              <p className="text-xs text-[var(--danger)]">
                +{stats.arrears.byPeriod.length - 5} bulan lainnya —{" "}
                <Link href="/payments?view=arrears" className="underline">
                  lihat semua
                </Link>
              </p>
            ) : undefined
          }
        />
      )}

      <div className="space-y-6">
        <RevenueChart />

        <div>
          <h2 className="mb-4 font-heading text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Operasional
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {operationalCards.map((card) => (
              <KpiCard key={card.title} {...card} />
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-4 font-heading text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Perlu Perhatian
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {attentionCards.map((card) => (
              <KpiCard key={card.title} {...card} />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
