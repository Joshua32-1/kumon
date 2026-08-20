import { describe, it, expect } from "vitest"
import {
  isReminderDay,
  isOverdueChaseEligible,
  selectReminderToSend,
  sortChaseCandidates,
  latestSentAt,
  chaseWindowPeriods,
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

describe("isOverdueChaseEligible with maxPriorMonths", () => {
  const ctx = { currentMonth: 8, currentYear: 2026, maxPriorMonths: 3 }

  it("chases an OVERDUE invoice at every offset inside the window", () => {
    for (const [month, year] of [[8, 2026], [7, 2026], [6, 2026], [5, 2026]] as const) {
      expect(isOverdueChaseEligible({ status: "OVERDUE", month, year, ...ctx })).toBe(true)
    }
  })

  it("stops chasing once the invoice falls outside the window", () => {
    expect(isOverdueChaseEligible({ status: "OVERDUE", month: 4, year: 2026, ...ctx })).toBe(false)
    expect(isOverdueChaseEligible({ status: "OVERDUE", month: 12, year: 2025, ...ctx })).toBe(false)
  })

  it("counts the window across a year boundary", () => {
    const jan = { currentMonth: 1, currentYear: 2027, maxPriorMonths: 3 }
    expect(isOverdueChaseEligible({ status: "OVERDUE", month: 10, year: 2026, ...jan })).toBe(true)
    expect(isOverdueChaseEligible({ status: "OVERDUE", month: 9, year: 2026, ...jan })).toBe(false)
  })

  it("never chases a future period", () => {
    expect(isOverdueChaseEligible({ status: "OVERDUE", month: 9, year: 2026, ...ctx })).toBe(false)
  })

  it("still requires a prior period for PENDING, even inside the window", () => {
    expect(isOverdueChaseEligible({ status: "PENDING", month: 8, year: 2026, ...ctx })).toBe(false)
    expect(isOverdueChaseEligible({ status: "PENDING", month: 7, year: 2026, ...ctx })).toBe(true)
  })

  it("considers every prior period when no cap is given", () => {
    expect(
      isOverdueChaseEligible({ status: "OVERDUE", month: 1, year: 2020, currentMonth: 8, currentYear: 2026 })
    ).toBe(true)
  })
})

describe("chaseWindowPeriods", () => {
  it("returns the current period plus maxPriorMonths before it, newest first", () => {
    expect(chaseWindowPeriods(8, 2026, 3)).toEqual([
      { month: 8, year: 2026 },
      { month: 7, year: 2026 },
      { month: 6, year: 2026 },
      { month: 5, year: 2026 },
    ])
  })

  it("rolls back over a year boundary", () => {
    expect(chaseWindowPeriods(2, 2027, 3)).toEqual([
      { month: 2, year: 2027 },
      { month: 1, year: 2027 },
      { month: 12, year: 2026 },
      { month: 11, year: 2026 },
    ])
  })

  it("returns just the current period when the cap is zero", () => {
    expect(chaseWindowPeriods(8, 2026, 0)).toEqual([{ month: 8, year: 2026 }])
  })
})

describe("latestSentAt", () => {
  it("returns the most recent SENT timestamp", () => {
    expect(
      latestSentAt([
        { sent_at: "2026-07-11T02:00:00Z", status: "SENT" },
        { sent_at: "2026-08-01T02:00:00Z", status: "SENT" },
        { sent_at: "2026-06-01T02:00:00Z", status: "SENT" },
      ])
    ).toBe("2026-08-01T02:00:00Z")
  })

  it("ignores rows that never actually went out", () => {
    expect(
      latestSentAt([
        { sent_at: null, status: "PENDING" },
        { sent_at: null, status: "CANCELLED" },
        { sent_at: "2026-08-01T02:00:00Z", status: "FAILED" },
      ])
    ).toBeNull()
  })

  it("returns null for an invoice with no reminders at all", () => {
    expect(latestSentAt([])).toBeNull()
  })
})

describe("sortChaseCandidates", () => {
  it("puts never-chased invoices ahead of everyone else", () => {
    const sorted = sortChaseCandidates([
      { id: "b", lastChasedAt: "2026-08-01T02:00:00Z" },
      { id: "a", lastChasedAt: null },
    ])
    expect(sorted.map((c) => c.id)).toEqual(["a", "b"])
  })

  it("orders the rest oldest-contact first", () => {
    const sorted = sortChaseCandidates([
      { id: "recent", lastChasedAt: "2026-08-11T02:00:00Z" },
      { id: "oldest", lastChasedAt: "2026-06-01T02:00:00Z" },
      { id: "middle", lastChasedAt: "2026-07-11T02:00:00Z" },
    ])
    expect(sorted.map((c) => c.id)).toEqual(["oldest", "middle", "recent"])
  })

  it("breaks ties on id so a truncated run is reproducible", () => {
    const rows = [
      { id: "c", lastChasedAt: null },
      { id: "a", lastChasedAt: null },
      { id: "b", lastChasedAt: null },
    ]
    expect(sortChaseCandidates(rows).map((c) => c.id)).toEqual(["a", "b", "c"])
    expect(sortChaseCandidates([...rows].reverse()).map((c) => c.id)).toEqual(["a", "b", "c"])
  })

  it("does not mutate the input", () => {
    const rows = [
      { id: "b", lastChasedAt: "2026-08-01T02:00:00Z" },
      { id: "a", lastChasedAt: null },
    ]
    sortChaseCandidates(rows)
    expect(rows.map((c) => c.id)).toEqual(["b", "a"])
  })

  it("rotates: whoever is cut off by a limit leads the next run", () => {
    // Three invoices, capacity of two per run — the starvation scenario in miniature.
    let state: { id: string; lastChasedAt: string | null }[] = [
      { id: "a", lastChasedAt: null },
      { id: "b", lastChasedAt: null },
      { id: "c", lastChasedAt: null },
    ]
    const runOne = sortChaseCandidates(state).slice(0, 2)
    expect(runOne.map((c) => c.id)).toEqual(["a", "b"])

    state = state.map((c) =>
      runOne.some((r) => r.id === c.id) ? { ...c, lastChasedAt: "2026-08-21T02:00:00Z" } : c
    )
    // "c" was starved by the old physical-order code; now it leads.
    expect(sortChaseCandidates(state).map((c) => c.id)).toEqual(["c", "a", "b"])
  })
})
