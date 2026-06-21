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
  type RevenueChartPeriod,
} from "@/lib/billing/revenue-chart"
import type { CollectionRateData, CollectionRatePoint } from "@/lib/reports/collection-rate"
import { formatRupiah } from "@/lib/utils"

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to load collection-rate data")
    return res.json().then((body) => body.data as CollectionRateData)
  })

function formatPct(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: CollectionRatePoint }>
}) {
  if (!active || !payload?.[0]) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-card">
      <p className="font-medium text-foreground">{p.label}</p>
      <p className="text-muted-foreground">Tertagih: {formatPct(p.rate)}</p>
      <p className="text-muted-foreground">
        {formatRupiah(p.paid)} / {formatRupiah(p.billed)}
      </p>
    </div>
  )
}

export function CollectionRateChart() {
  const [period, setPeriod] = useState<RevenueChartPeriod>("1_year")
  const { data, isLoading, error } = useSWR(
    `/api/reports/collection-rate?period=${period}`,
    fetcher
  )

  const points = (data?.points ?? []).map((p) => ({
    ...p,
    // null rate (nothing billed that month) → no bar (gap), distinct from a real 0%.
    pct: p.rate == null ? null : Math.round(p.rate * 100),
  }))

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Tingkat Penagihan</CardTitle>
        <CardDescription>
          Persentase tagihan yang lunas per bulan
          {data ? ` · Rata-rata ${formatPct(data.rate)}` : ""}
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
            Gagal memuat data penagihan.
          </div>
        ) : points.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
            Belum ada tagihan untuk periode ini.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
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
                  tickFormatter={(v) => `${v}%`}
                  domain={[0, 100]}
                  width={40}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                  content={<ChartTooltip />}
                />
                <Bar dataKey="pct" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
