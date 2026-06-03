import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { NextResponse } from "next/server"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── API response envelope ──────────────────────────────────────────────────

export type ApiSuccess<T> = { data: T; error: null }
export type ApiError = { data: null; error: { code: string; message: string } }

export function apiSuccess<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ data, error: null }, { status })
}

export function apiError(
  code: string,
  message: string,
  status = 400
): NextResponse<ApiError> {
  return NextResponse.json({ data: null, error: { code, message } }, { status })
}

// ── Formatting ─────────────────────────────────────────────────────────────

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount)
}

export function getMonthName(month: number, lang: "id" | "en" = "id"): string {
  return new Date(2000, month - 1, 1).toLocaleString(
    lang === "id" ? "id-ID" : "en-US",
    { month: "long" }
  )
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

// ── Timezone helpers (center operates in WIB) ──────────────────────────────

const CENTER_TIMEZONE = "Asia/Jakarta"

export function todayInCenterTimezone(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CENTER_TIMEZONE }).format(date)
}

export function currentMonthYearInCenterTimezone(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CENTER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date)
  const year = Number(parts.find((p) => p.type === "year")!.value)
  const month = Number(parts.find((p) => p.type === "month")!.value)
  return { month, year }
}

export function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}
