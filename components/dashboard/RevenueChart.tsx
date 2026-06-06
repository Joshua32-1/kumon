"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  Bar,
  BarChart,
  CartesianGrid,
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
  type RevenueChartData,
  type RevenueChartPeriod,
} from "@/lib/billing/revenue-chart"
import { formatRupiah } from "@/lib/utils"

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to load revenue data")
    return res.json().then((body) => body.data as RevenueChartData)
  })

function formatAxisAmount(value: number): string {
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}jt`
  if (value >= 1_000) return `${Math.round(value / 1_000)}rb`
  return String(value)
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: { label: string; amount: number } }>
}) {
  if (!active || !payload?.[0]) return null
  const point = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-card">
      <p className="font-medium text-foreground">{point.label}</p>
      <p className="text-muted-foreground">{formatRupiah(point.amount)}</p>
    </div>
  )
}

export function RevenueChart() {
  const [period, setPeriod] = useState<RevenueChartPeriod>("1_year")
  const { data, isLoading, error } = useSWR(
    `/api/dashboard/revenue?period=${period}`,
    fetcher
  )

  const points = data?.points ?? []
  const total = data?.total ?? 0

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Pendapatan</CardTitle>
        <CardDescription>
          Pembayaran lunas per bulan
          {data ? ` · Total ${formatRupiah(total)}` : ""}
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
            Gagal memuat data pendapatan.
          </div>
        ) : points.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
            Belum ada pembayaran lunas untuk periode ini.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={points}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--border)"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  interval={points.length > 18 ? Math.floor(points.length / 12) : 0}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  tickFormatter={formatAxisAmount}
                  width={48}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                  content={<ChartTooltip />}
                />
                <Bar
                  dataKey="amount"
                  fill="var(--chart-1)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
