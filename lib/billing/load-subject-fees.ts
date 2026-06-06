import { createSupabaseServerClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import {
  parseSubjectFees,
  type SubjectFeeConfig,
} from "@/lib/billing/fees"
import {
  parseFeeSchedule,
  resolveFeesForPeriod,
  findEffectiveFeeScheduleEntry,
  appendFeeScheduleEntry,
  feeScheduleEntryForCurrentMonth,
  type FeeScheduleEntry,
} from "@/lib/billing/fee-schedule"

type DbClient = Awaited<ReturnType<typeof createSupabaseServerClient>> | typeof supabaseAdmin

export interface SubjectFeesForPeriod {
  fees: SubjectFeeConfig
  effectiveEntry: FeeScheduleEntry | null
  schedule: FeeScheduleEntry[]
}

export async function loadSubjectFeesForPeriod(
  supabase: DbClient,
  billingMonth: number,
  billingYear: number
): Promise<SubjectFeesForPeriod> {
  const { data: rows } = await supabase
    .from("system_config")
    .select("key, value")
    .in("key", ["subject_fees", "subject_fees_schedule"])

  let currentFees = parseSubjectFees(undefined)
  let schedule: FeeScheduleEntry[] = []

  for (const row of rows ?? []) {
    if (row.key === "subject_fees") {
      currentFees = parseSubjectFees(row.value as Record<string, unknown>)
    }
    if (row.key === "subject_fees_schedule") {
      schedule = parseFeeSchedule(row.value)
    }
  }

  if (schedule.length === 0) {
    schedule = [{ year: 2020, month: 1, fees: currentFees }]
  }

  const fees = resolveFeesForPeriod(schedule, billingMonth, billingYear, currentFees)
  const effectiveEntry = findEffectiveFeeScheduleEntry(schedule, billingMonth, billingYear)

  return { fees, effectiveEntry, schedule }
}

export async function persistFeeScheduleOnSettingsSave(
  supabase: DbClient,
  feesValue: Record<string, unknown>
): Promise<void> {
  const parsed = parseSubjectFees(feesValue)

  const { data: scheduleRow } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", "subject_fees_schedule")
    .maybeSingle()

  const existing = parseFeeSchedule(scheduleRow?.value)
  const { month, year } = feeScheduleEntryForCurrentMonth(parsed)
  const next = appendFeeScheduleEntry(existing, month, year, parsed)

  await supabase
    .from("system_config")
    .upsert({
      key: "subject_fees_schedule",
      value: next,
      updated_at: new Date().toISOString(),
    })
}
