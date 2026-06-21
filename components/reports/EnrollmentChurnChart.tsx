"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { FilterPill } from "@/components/shared/FilterPill"
import { LoadingSpinner } from "@/components/shared/LoadingSpinner"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  REVENUE_CHART_PERIODS,
  REVENUE_PERIOD_LABELS,
  type RevenueChartPeriod,
} from "@/lib/billing/revenue-chart"
import type { EnrollmentChurnData, EnrollmentChurnPoint } from "@/lib/reports/enrollment-churn"

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to load enrollment data")
    return res.json().then((body) => body.data as EnrollmentChurnData)
  })

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: EnrollmentChurnPoint }>
}) {
  if (!active || !payload?.[0]) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-card">
      <p className="font-medium text-foreground">{p.label}</p>
      <p className="text-muted-foreground">Daftar baru: {p.joined}</p>
      <p className="text-muted-foreground">Nonaktif: {p.churned}</p>
      <p className="text-muted-foreground">Netto: {p.net >= 0 ? `+${p.net}` : p.net}</p>
      <p className="text-muted-foreground">Aktif: {p.activeAtEnd}</p>
    </div>
  )
}

export function EnrollmentChurnChart() {
  const [period, setPeriod] = useState<RevenueChartPeriod>("1_year")
  const { data, isLoading, error } = useSWR(
    `/api/reports/enrollment?period=${period}`,
    fetcher
  )

  const points = data?.points ?? []

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Pendaftaran vs. Nonaktif</CardTitle>
        <CardDescription>
          Siswa baru, nonaktif, dan total aktif per bulan
          {data ? ` · ${data.currentActive} aktif` : ""}
        </CardDescription>
        <CardAction>
          <div className="flex flex-wrap justify-end gap-2">
            {REVENUE_CHART_PERIODS.map((value) => (
              <FilterPill
                key={value}
                label={REVENUE_PERIOD_LABELS[value]}
                active={period === value}
                onClick={() => setPeriod(value)}
              />
            ))}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="pt-6">
        {isLoading ? (
          <div className="flex h-72 items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
            Gagal memuat data pendaftaran.
          </div>
        ) : points.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
            Belum ada data untuk periode ini.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  interval={points.length > 18 ? Math.floor(points.length / 12) : 0}
                />
                <YAxis
                  yAxisId="left"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  allowDecimals={false}
                  width={32}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  allowDecimals={false}
                  width={32}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                  content={<ChartTooltip />}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value) => (
                    <span className="text-muted-foreground">{value}</span>
                  )}
                />
                <Bar yAxisId="left" name="Daftar baru" dataKey="joined" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar yAxisId="left" name="Nonaktif" dataKey="churned" fill="var(--danger)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Line
                  yAxisId="right"
                  name="Total aktif"
                  type="monotone"
                  dataKey="activeAtEnd"
                  stroke="var(--chart-2, var(--foreground))"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
