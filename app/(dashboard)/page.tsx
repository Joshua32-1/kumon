import { createSupabaseServerClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/shared/PageHeader"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatRupiah, getMonthName } from "@/lib/utils"

async function getDashboardStats() {
  const supabase = await createSupabaseServerClient()
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const [
    { count: activeStudents },
    { count: unpaidInvoices },
    { data: paidInvoices },
    { count: temporaryLeave },
  ] = await Promise.all([
    supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("status", "ACTIVE"),
    supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .in("status", ["PENDING", "OVERDUE"]),
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
  ])

  const monthlyRevenue = (paidInvoices ?? []).reduce(
    (sum, inv) => sum + inv.amount,
    0
  )

  return {
    activeStudents: activeStudents ?? 0,
    unpaidInvoices: unpaidInvoices ?? 0,
    monthlyRevenue,
    temporaryLeave: temporaryLeave ?? 0,
    currentMonth: getMonthName(month),
    currentYear: year,
  }
}

export default async function DashboardPage() {
  const stats = await getDashboardStats()

  const cards = [
    {
      title: "Siswa Aktif",
      value: stats.activeStudents,
      description: "Total siswa berstatus aktif",
    },
    {
      title: "Tagihan Belum Lunas",
      value: stats.unpaidInvoices,
      description: "Tagihan pending + overdue",
      highlight: stats.unpaidInvoices > 0,
    },
    {
      title: `Pendapatan ${stats.currentMonth} ${stats.currentYear}`,
      value: formatRupiah(stats.monthlyRevenue),
      description: "Total pembayaran lunas bulan ini",
    },
    {
      title: "Siswa Cuti",
      value: stats.temporaryLeave,
      description: "Sedang dalam status cuti sementara",
    },
  ]

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Ringkasan operasional ${stats.currentMonth} ${stats.currentYear}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title} className={card.highlight ? "border-orange-300" : undefined}>
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
        ))}
      </div>
    </>
  )
}
