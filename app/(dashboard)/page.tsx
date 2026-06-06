import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { studentService } from "@/features/students/service"
import { PageHeader } from "@/components/shared/PageHeader"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
      .select("id, student_id, month, year, amount, status, due_date, midtrans_payment_url, payment_reminders(status, scheduled_date)")
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

  // Use getBillingSummary for consistent needs-action logic (same as Pembayaran page)
  let needsActionCount = 0
  for (const inv of allUnpaidRows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invAny = inv as any
    const reminders: PaymentReminder[] = invAny.payment_reminders ?? []
    // Only count current-month for "perlu tindakan" card
    if (invAny.month === month && invAny.year === year) {
      const summary = getBillingSummary(invAny as Invoice, reminders, today)
      if (summary.attention === "needs_action") needsActionCount++
    }
  }

  // Arrears: all unpaid across months
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

  const cards = [
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
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-950">
              Siswa cuti {leaveReview.max_consecutive_months}+ bulan berturut-turut
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-muted-foreground text-sm">
              Batas di Pengaturan adalah bulan cuti <strong>berurutan</strong>, bukan total.
              Review apakah siswa perlu dinonaktifkan.
            </p>
            <ul className="divide-y divide-amber-200/80 rounded-md border border-amber-200 bg-white">
              {leaveReview.students.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/students/${s.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-amber-50"
                  >
                    <span className="font-medium text-amber-950">{s.full_name}</span>
                    <span className="text-amber-800 text-xs">
                      {leaveReviewSummary(s)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Tunggakan breakdown panel */}
      {stats.arrears.byPeriod.length > 0 && (
        <Card className="border-red-200 bg-red-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-red-900">
              Tunggakan {stats.arrears.count} tagihan — {formatRupiah(stats.arrears.totalAmount)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-700 mb-3">
              Tagihan melewati jatuh tempo dan belum lunas. Cron mengirim pengingat pada tanggal 1, 11, 21.
            </p>
            <ul className="divide-y divide-red-200/80 rounded-md border border-red-200 bg-white">
              {stats.arrears.byPeriod.slice(0, 5).map((p) => (
                <li key={`${p.year}-${p.month}`}>
                  <Link
                    href={`/payments?view=arrears&month=${p.month}&year=${p.year}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-red-50"
                  >
                    <span className="font-medium text-red-900">
                      {getMonthName(p.month)} {p.year}
                    </span>
                    <span className="text-red-700 text-xs">
                      {p.count} siswa · {formatRupiah(p.totalAmount)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {stats.arrears.byPeriod.length > 5 && (
              <p className="text-xs text-red-600 mt-2">
                +{stats.arrears.byPeriod.length - 5} bulan lainnya —{" "}
                <Link href="/payments?view=arrears" className="underline">
                  lihat semua
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const inner = (
            <Card
              key={card.title}
              className={card.highlight ? "border-orange-300" : undefined}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{card.value}</p>
                <p className="text-muted-foreground mt-1 text-xs">{card.description}</p>
              </CardContent>
            </Card>
          )

          return card.href ? (
            <Link key={card.title} href={card.href} className="block">
              {inner}
            </Link>
          ) : (
            <div key={card.title}>{inner}</div>
          )
        })}
      </div>
    </>
  )
}
