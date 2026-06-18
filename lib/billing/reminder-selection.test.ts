import { describe, it, expect } from "vitest"
import {
  isReminderDay,
  isOverdueChaseEligible,
  selectDueReminder,
} from "@/lib/billing/reminder-selection"
import { DEFAULT_REMINDER_DAYS } from "@/lib/constants"

describe("isReminderDay", () => {
  it("is true on configured reminder days and false otherwise", () => {
    expect(isReminderDay("2026-06-01", DEFAULT_REMINDER_DAYS)).toBe(true)
    expect(isReminderDay("2026-06-11", DEFAULT_REMINDER_DAYS)).toBe(true)
    expect(isReminderDay("2026-06-21", DEFAULT_REMINDER_DAYS)).toBe(true)
    expect(isReminderDay("2026-06-15", DEFAULT_REMINDER_DAYS)).toBe(false)
  })
})

describe("isOverdueChaseEligible", () => {
  const ctx = { currentMonth: 6, currentYear: 2026 }

  it("always chases OVERDUE invoices", () => {
    expect(isOverdueChaseEligible({ status: "OVERDUE", month: 6, year: 2026, ...ctx })).toBe(true)
  })

  it("chases PENDING invoices only from a prior period", () => {
    expect(isOverdueChaseEligible({ status: "PENDING", month: 5, year: 2026, ...ctx })).toBe(true)
    expect(isOverdueChaseEligible({ status: "PENDING", month: 6, year: 2026, ...ctx })).toBe(false)
    expect(isOverdueChaseEligible({ status: "PENDING", month: 7, year: 2026, ...ctx })).toBe(false)
  })

  it("never chases terminal statuses", () => {
    for (const status of ["PAID", "CANCELLED", "WAIVED", "PAID_OLD_LINK"] as const) {
      expect(isOverdueChaseEligible({ status, month: 1, year: 2020, ...ctx })).toBe(false)
    }
  })
})

describe("selectDueReminder", () => {
  const reminders = [
    { reminder_number: 1, id: "a" },
    { reminder_number: 3, id: "c" },
    { reminder_number: 2, id: "b" },
  ]

  it("picks the highest reminder_number on the scheduled path", () => {
    expect(selectDueReminder(reminders, { ignoreSchedule: false })?.id).toBe("c")
  })

  it("picks the lowest reminder_number for the bulk (ignoreSchedule) path", () => {
    expect(selectDueReminder(reminders, { ignoreSchedule: true })?.id).toBe("a")
  })

  it("returns null for an empty set", () => {
    expect(selectDueReminder([], { ignoreSchedule: false })).toBeNull()
  })
})
