import { describe, it, expect } from "vitest"
import {
  isReminderDay,
  isOverdueChaseEligible,
  selectReminderToSend,
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

describe("selectReminderToSend", () => {
  const today = "2026-06-22"

  // Mid-month enrollment: all three reminder slots are already in the past.
  const allPastDue = [
    { reminder_number: 1, id: "a", scheduled_date: "2026-06-01", status: "PENDING" },
    { reminder_number: 3, id: "c", scheduled_date: "2026-06-21", status: "PENDING" },
    { reminder_number: 2, id: "b", scheduled_date: "2026-06-11", status: "PENDING" },
  ]

  // Normal early-month: only reminder 1 is due, 2 & 3 are still in the future.
  const mixed = [
    { reminder_number: 1, id: "a", scheduled_date: "2026-06-01", status: "PENDING" },
    { reminder_number: 2, id: "b", scheduled_date: "2026-06-11", status: "PENDING" },
    { reminder_number: 3, id: "c", scheduled_date: "2026-06-21", status: "PENDING" },
  ]
  const earlyToday = "2026-06-03"

  it("picks the highest past-due reminder and supersedes older ones (scheduled path)", () => {
    const { target, supersede } = selectReminderToSend(allPastDue, {
      today,
      ignoreSchedule: false,
    })
    expect(target?.id).toBe("c")
    expect(supersede).toBe(true)
  })

  it("picks the highest past-due reminder and supersedes older ones (bulk path) — the bug fix", () => {
    const { target, supersede } = selectReminderToSend(allPastDue, {
      today,
      ignoreSchedule: true,
    })
    expect(target?.id).toBe("c")
    expect(supersede).toBe(true)
  })

  it("sends only the due reminder when later slots are still in the future", () => {
    const { target, supersede } = selectReminderToSend(mixed, {
      today: earlyToday,
      ignoreSchedule: true,
    })
    expect(target?.id).toBe("a")
    // supersede only cancels OLDER due rows; there are none below reminder 1.
    expect(supersede).toBe(true)
  })

  it("falls back to the earliest future reminder for the bulk path when nothing is due", () => {
    const allFuture = mixed
    const { target, supersede } = selectReminderToSend(allFuture, {
      today: "2026-05-15",
      ignoreSchedule: true,
    })
    expect(target?.id).toBe("a")
    expect(supersede).toBe(false)
  })

  it("does NOT advance the cadence on the bulk path once a reminder has been sent", () => {
    // reminder 1 already SENT, 2 & 3 still in the future, nothing due → no push-ahead.
    const partlySent = [
      { reminder_number: 1, id: "a", scheduled_date: "2026-06-01", status: "SENT" },
      { reminder_number: 2, id: "b", scheduled_date: "2026-06-11", status: "PENDING" },
      { reminder_number: 3, id: "c", scheduled_date: "2026-06-21", status: "PENDING" },
    ]
    const { target, supersede } = selectReminderToSend(partlySent, {
      today: earlyToday,
      ignoreSchedule: true,
    })
    expect(target).toBeNull()
    expect(supersede).toBe(false)
  })

  it("ignores SENT/CANCELLED rows when picking among due reminders", () => {
    // The lowest-numbered due rows are terminal; only reminder 3 is sendable.
    const someTerminal = [
      { reminder_number: 1, id: "a", scheduled_date: "2026-06-01", status: "CANCELLED" },
      { reminder_number: 2, id: "b", scheduled_date: "2026-06-11", status: "SENT" },
      { reminder_number: 3, id: "c", scheduled_date: "2026-06-21", status: "PENDING" },
    ]
    const { target, supersede } = selectReminderToSend(someTerminal, {
      today,
      ignoreSchedule: false,
    })
    expect(target?.id).toBe("c")
    expect(supersede).toBe(true)
  })

  it("sends nothing on the scheduled path when nothing is due", () => {
    const { target, supersede } = selectReminderToSend(mixed, {
      today: "2026-05-15",
      ignoreSchedule: false,
    })
    expect(target).toBeNull()
    expect(supersede).toBe(false)
  })

  it("returns a null target for an empty set", () => {
    expect(
      selectReminderToSend([], { today, ignoreSchedule: true })
    ).toEqual({ target: null, supersede: false })
  })
})
