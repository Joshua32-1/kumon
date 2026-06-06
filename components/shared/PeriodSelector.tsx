"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface PeriodSelectorProps {
  month: number
  year: number
  onMonthChange: (month: number) => void
  onYearChange: (year: number) => void
  monthNames?: string[]
  months?: number[]
  years?: number[]
  label?: string
}

const DEFAULT_MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agt", "Sep", "Okt", "Nov", "Des",
]

export function PeriodSelector({
  month,
  year,
  onMonthChange,
  onYearChange,
  monthNames = DEFAULT_MONTH_NAMES,
  months = Array.from({ length: 12 }, (_, i) => i + 1),
  years,
  label = "Tagihan:",
}: PeriodSelectorProps) {
  const yearOptions = years ?? [year - 1, year, year + 1]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="ml-1 text-xs text-muted-foreground">{label}</span>
      <Select
        value={String(month)}
        onValueChange={(v) => onMonthChange(Number(v))}
      >
        <SelectTrigger size="sm" className="min-w-[5rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {months.map((m) => (
            <SelectItem key={m} value={String(m)}>
              {monthNames[m - 1]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={String(year)}
        onValueChange={(v) => onYearChange(Number(v))}
      >
        <SelectTrigger size="sm" className="min-w-[5rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {yearOptions.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
