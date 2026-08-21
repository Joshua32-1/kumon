import { describe, it, expect } from "vitest"
import {
  isReminderDay,
  isOverdueChaseEligible,
  selectReminderToSend,
  sortChaseCandidates,
  latestSentAt,
  chaseWindowPeriods,
  failedRetryWindowStart,
  isPhase1DueReminder,
  alreadyContactedOn,
} from "@/lib/billing/reminder-selection"
import {
  DEFAULT_REMINDER_DAYS,
  REMINDER_FAILED_RETRY_WINDOW_DAYS,
} from "@/lib/constants"

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


describe("failedRetryWindowStart", () => {
  it("returns the date `windowDays` before today", () => {
    expect(failedRetryWindowStart("2026-06-21", 11)).toBe("2026-06-10")
  })

  it("reaches back to the previous reminder day from each reminder day", () => {
    // The window exists to survive the gap between cron runs, which only happen on
    // 1/11/21 — so from each reminder day it must still cover the one before it.
    const window = REMINDER_FAILED_RETRY_WINDOW_DAYS
    expect(failedRetryWindowStart("2026-06-11", window) <= "2026-06-01").toBe(true)
    expect(failedRetryWindowStart("2026-06-21", window) <= "2026-06-11").toBe(true)
    // 21st → 1st of the next month is the widest gap (11 days in a 31-day month).
    expect(failedRetryWindowStart("2026-08-01", window) <= "2026-07-21").toBe(true)
    // …and February's short gap is covered by the same window.
    expect(failedRetryWindowStart("2026-03-01", window) <= "2026-02-21").toBe(true)
  })

  it("does not reach back two reminder days", () => {
    // The guard half of the bound: a FAILED row gets one extra reminder day, never two.
    const window = REMINDER_FAILED_RETRY_WINDOW_DAYS
    expect(failedRetryWindowStart("2026-06-21", window) > "2026-06-01").toBe(true)
    expect(failedRetryWindowStart("2026-08-01", window) > "2026-07-11").toBe(true)
  })
})

describe("isPhase1DueReminder", () => {
  const today = "2026-06-21"
  const failedRetryFrom = failedRetryWindowStart(today, REMINDER_FAILED_RETRY_WINDOW_DAYS)
  const opts = { today, failedRetryFrom }

  it("picks up a PENDING row however long it has been stranded", () => {
    // No lower bound for PENDING: mid-month enrollment / manual generation / cuti rebill
    // all leave rows dated before the invoice existed, and they must still self-heal.
    expect(isPhase1DueReminder({ status: "PENDING", scheduled_date: today, first_failed_on: null }, opts)).toBe(true)
    expect(isPhase1DueReminder({ status: "PENDING", scheduled_date: "2026-06-01", first_failed_on: null }, opts)).toBe(true)
    expect(isPhase1DueReminder({ status: "PENDING", scheduled_date: "2025-01-01", first_failed_on: null }, opts)).toBe(true)
  })

  it("skips rows not yet due", () => {
    expect(isPhase1DueReminder({ status: "PENDING", scheduled_date: "2026-06-22", first_failed_on: null }, opts)).toBe(false)
    expect(isPhase1DueReminder({ status: "FAILED", scheduled_date: "2026-06-22", first_failed_on: null }, opts)).toBe(false)
  })

  it("still retries a FAILED row on the same day (the pre-existing behaviour)", () => {
    expect(isPhase1DueReminder({ status: "FAILED", scheduled_date: today, first_failed_on: null }, opts)).toBe(true)
  })

  it("retries a FAILED row after the calendar day rolls over — the durability fix", () => {
    // Before this, a row that failed mid-batch matched neither branch from the next day
    // on, so the parent silently never received that reminder.
    expect(isPhase1DueReminder({ status: "FAILED", scheduled_date: "2026-06-20", first_failed_on: null }, opts)).toBe(true)
    expect(isPhase1DueReminder({ status: "FAILED", scheduled_date: "2026-06-11", first_failed_on: null }, opts)).toBe(true)
  })

  it("treats the window start as inclusive and the day before it as out", () => {
    expect(isPhase1DueReminder({ status: "FAILED", scheduled_date: failedRetryFrom, first_failed_on: null }, opts)).toBe(true)
    const dayBefore = failedRetryWindowStart(today, REMINDER_FAILED_RETRY_WINDOW_DAYS + 1)
    expect(isPhase1DueReminder({ status: "FAILED", scheduled_date: dayBefore, first_failed_on: null }, opts)).toBe(false)
  })

  it("stops retrying an ancient FAILED row — the guard the window keeps", () => {
    // A permanently-failing number must not be re-hit on every slot forever.
    expect(isPhase1DueReminder({ status: "FAILED", scheduled_date: "2026-01-11", first_failed_on: null }, opts)).toBe(false)
    expect(isPhase1DueReminder({ status: "FAILED", scheduled_date: "2025-06-21", first_failed_on: null }, opts)).toBe(false)
  })

  it("ignores terminal statuses entirely", () => {
    for (const status of ["SENT", "CANCELLED"]) {
      expect(
        isPhase1DueReminder({ status, scheduled_date: today, first_failed_on: null }, opts)
      ).toBe(false)
      expect(
        isPhase1DueReminder(
          { status, scheduled_date: "2026-06-20", first_failed_on: today },
          opts
        )
      ).toBe(false)
    }
  })

  it("carries an outage on one reminder day to the next one, then lets it go", () => {
    // Reminder 3 fails on the 21st — the last slot of the last reminder day of the month,
    // with the invoice still PENDING until its end-of-month due date, so nothing else
    // would have picked it up.
    const failed = { status: "FAILED", scheduled_date: "2026-06-21", first_failed_on: null }
    const nextReminderDay = { today: "2026-07-01", failedRetryFrom: failedRetryWindowStart("2026-07-01", REMINDER_FAILED_RETRY_WINDOW_DAYS) }
    expect(isPhase1DueReminder(failed, nextReminderDay)).toBe(true)

    const dayAfterThat = { today: "2026-07-11", failedRetryFrom: failedRetryWindowStart("2026-07-11", REMINDER_FAILED_RETRY_WINDOW_DAYS) }
    expect(isPhase1DueReminder(failed, dayAfterThat)).toBe(false)
  })

  it("measures the window from the day the send was attempted, not the schedule", () => {
    // Issue #26. Both cases stranded the row when the anchor was scheduled_date: the first
    // attempt landed days late, so by the next cron run the schedule was already outside an
    // 11-day window. Anchored to first_failed_on, the clock starts when we actually tried.
    const july1 = "2026-07-01"
    const opts1 = {
      today: july1,
      failedRetryFrom: failedRetryWindowStart(july1, REMINDER_FAILED_RETRY_WINDOW_DAYS),
    }

    // reminder_days set to [1,15]: row dated the 15th, first attempted on the 21st (the next
    // day the cron actually runs, since vercel.json does not follow that config).
    expect(
      isPhase1DueReminder(
        { status: "FAILED", scheduled_date: "2026-06-15", first_failed_on: "2026-06-21" },
        opts1
      )
    ).toBe(true)
    // Same row on the old scheduled_date anchor — the stranding this fixes.
    expect(
      isPhase1DueReminder({ status: "FAILED", scheduled_date: "2026-06-15", first_failed_on: null }, opts1)
    ).toBe(false)

    // Default config, but the 11th's cron never ran: row dated the 11th, attempted the 21st.
    expect(
      isPhase1DueReminder(
        { status: "FAILED", scheduled_date: "2026-06-11", first_failed_on: "2026-06-21" },
        opts1
      )
    ).toBe(true)
    expect(
      isPhase1DueReminder({ status: "FAILED", scheduled_date: "2026-06-11", first_failed_on: null }, opts1)
    ).toBe(false)
  })

  it("keeps a row that failed BEFORE it was due — anchor is the later of the two", () => {
    // The admin bulk push-ahead (ignoreSchedule) sends the earliest FUTURE reminder, so a
    // failure there stamps first_failed_on earlier than scheduled_date. Anchoring on the
    // stamp alone would expire the window before the row ever came due and the reminder
    // would never go out at all — worse than the bug this column fixes.
    const today = "2026-06-21"
    const opts = {
      today,
      failedRetryFrom: failedRetryWindowStart(today, REMINDER_FAILED_RETRY_WINDOW_DAYS),
    }
    expect(
      isPhase1DueReminder(
        { status: "FAILED", scheduled_date: "2026-06-21", first_failed_on: "2026-06-01" },
        opts
      )
    ).toBe(true)
  })

  it("still ages out a permanently-failing number from its first attempt", () => {
    // The anchor is stamped once and never refreshed, so repeat failures cannot slide the
    // window forward. First failed 21 Jun: retried on 1 Jul, gone by 11 Jul.
    const row = {
      status: "FAILED",
      scheduled_date: "2026-06-21",
      first_failed_on: "2026-06-21",
    }
    for (const [today, expected] of [["2026-07-01", true], ["2026-07-11", false]] as const) {
      expect(
        isPhase1DueReminder(row, {
          today,
          failedRetryFrom: failedRetryWindowStart(today, REMINDER_FAILED_RETRY_WINDOW_DAYS),
        })
      ).toBe(expected)
    }
  })

  it("falls back to scheduled_date for rows written before the column existed", () => {
    const today = "2026-06-25"
    const opts = {
      today,
      failedRetryFrom: failedRetryWindowStart(today, REMINDER_FAILED_RETRY_WINDOW_DAYS),
    }
    expect(
      isPhase1DueReminder(
        { status: "FAILED", scheduled_date: "2026-06-21", first_failed_on: null },
        opts
      )
    ).toBe(true)
    expect(
      isPhase1DueReminder(
        { status: "FAILED", scheduled_date: "2026-06-01", first_failed_on: null },
        opts
      )
    ).toBe(false)
  })

  it("never sends a FAILED row whose scheduled_date is still in the future", () => {
    // The anchor governs the retry window; it must not override the not-yet-due gate.
    const today = "2026-06-21"
    expect(
      isPhase1DueReminder(
        { status: "FAILED", scheduled_date: "2026-06-22", first_failed_on: "2026-06-21" },
        { today, failedRetryFrom: failedRetryWindowStart(today, REMINDER_FAILED_RETRY_WINDOW_DAYS) }
      )
    ).toBe(false)
  })

  it("does not turn a rediscovered FAILED row into an extra send", () => {
    // Discovery widening only matters when nothing newer is waiting. Here reminder 1
    // failed on the 1st and reminder 2 comes due on the 11th: the invoice is picked up
    // either way, and selectReminderToSend sends only reminder 2, superseding the FAILED
    // row rather than re-sending it.
    const eleventh = "2026-06-11"
    const reminders = [
      { reminder_number: 1, id: "a", scheduled_date: "2026-06-01", status: "FAILED", first_failed_on: "2026-06-01" },
      { reminder_number: 2, id: "b", scheduled_date: eleventh, status: "PENDING", first_failed_on: null },
      { reminder_number: 3, id: "c", scheduled_date: "2026-06-21", status: "PENDING", first_failed_on: null },
    ]
    const windowStart = failedRetryWindowStart(eleventh, REMINDER_FAILED_RETRY_WINDOW_DAYS)
    expect(
      isPhase1DueReminder(reminders[0], { today: eleventh, failedRetryFrom: windowStart })
    ).toBe(true)

    const { target, supersede } = selectReminderToSend(reminders, {
      today: eleventh,
      ignoreSchedule: false,
    })
    expect(target?.id).toBe("b")
    expect(supersede).toBe(true)
  })

  it("sends the stranded FAILED row when it is the newest one due", () => {
    // Same invoice a month on: 1 and 2 went out, 3 failed on the 21st and is now the
    // highest due sendable row, so the retry actually reaches the parent.
    const reminders = [
      { reminder_number: 1, id: "a", scheduled_date: "2026-06-01", status: "SENT" },
      { reminder_number: 2, id: "b", scheduled_date: "2026-06-11", status: "SENT" },
      { reminder_number: 3, id: "c", scheduled_date: "2026-06-21", status: "FAILED" },
    ]
    const { target, supersede } = selectReminderToSend(reminders, {
      today: "2026-07-01",
      ignoreSchedule: false,
    })
    expect(target?.id).toBe("c")
    expect(supersede).toBe(true)
  })
})

describe("alreadyContactedOn", () => {
  it("is false for an invoice that has never been contacted", () => {
    expect(alreadyContactedOn(null, "2026-07-01")).toBe(false)
  })

  it("is true for a send made earlier the same WIB day", () => {
    // 02:00 UTC on 1 Jul is 09:00 WIB the same day — the first reminder slot.
    expect(alreadyContactedOn("2026-07-01T02:00:00Z", "2026-07-01")).toBe(true)
  })

  it("is false for a send on a previous day", () => {
    expect(alreadyContactedOn("2026-06-21T02:00:00Z", "2026-07-01")).toBe(false)
  })

  it("uses the WIB calendar day, not the UTC one", () => {
    // 17:30 UTC on 30 Jun is already 00:30 on 1 Jul in Jakarta (+7).
    expect(alreadyContactedOn("2026-06-30T17:30:00Z", "2026-07-01")).toBe(true)
    // …and 16:30 UTC is still 23:30 on 30 Jun there.
    expect(alreadyContactedOn("2026-06-30T16:30:00Z", "2026-07-01")).toBe(false)
  })

  it("stops the double message when Phase 1 sent from an older row — the dedupe fix", () => {
    // The outage case end to end. An arrears invoice's reminder failed on 21 Jun. On 1 Jul
    // slot 1, Phase 1 rediscovers it inside the retry window and sends from that 06-21 row.
    const failedOn21st = { status: "FAILED", scheduled_date: "2026-06-21", first_failed_on: null }
    const july1 = "2026-07-01"
    expect(
      isPhase1DueReminder(failedOn21st, {
        today: july1,
        failedRetryFrom: failedRetryWindowStart(july1, REMINDER_FAILED_RETRY_WINDOW_DAYS),
      })
    ).toBe(true)

    // That send stamps sent_at, but the row stays dated 06-21 — so Phase 2's
    // "is there a SENT row dated today?" check would miss it and chase the invoice again
    // in slot 3. The last-send check is what sees it.
    const afterPhase1 = latestSentAt([
      { sent_at: "2026-07-01T02:05:00Z", status: "SENT" },
    ])
    expect(alreadyContactedOn(afterPhase1, july1)).toBe(true)
  })

  it("still allows the chase when the last send was on an earlier reminder day", () => {
    const lastMonth = latestSentAt([
      { sent_at: "2026-06-11T02:00:00Z", status: "SENT" },
      { sent_at: "2026-06-21T02:00:00Z", status: "SENT" },
    ])
    expect(alreadyContactedOn(lastMonth, "2026-07-01")).toBe(false)
  })

  it("recognises a send made on the real day when replaying a past date", () => {
    // Ops replay: the run's logical `today` is the replayed reminder day, but sent_at is
    // stamped from the real clock. Comparing only against the logical day would report
    // "never contacted" for a message sent moments ago, and the replay's second
    // invocation would message the parent again.
    const sentJustNow = "2026-08-21T02:10:00Z"
    expect(alreadyContactedOn(sentJustNow, "2026-06-21")).toBe(false)
    expect(alreadyContactedOn(sentJustNow, "2026-06-21", "2026-08-21")).toBe(true)
  })

  it("still chases on a replay when the last send really was long ago", () => {
    expect(alreadyContactedOn("2026-06-11T02:00:00Z", "2026-06-21", "2026-08-21")).toBe(false)
  })

  it("collapses to one comparison on the scheduled path", () => {
    // realToday defaults to today, so the normal cron path is unaffected.
    expect(alreadyContactedOn("2026-07-01T02:00:00Z", "2026-07-01")).toBe(
      alreadyContactedOn("2026-07-01T02:00:00Z", "2026-07-01", "2026-07-01")
    )
  })

  it("does not block a same-day retry after a failed chase", () => {
    // A catch-up row that FAILED has no sent_at, so latestSentAt stays null and the next
    // slot may retry it — the same-day retry behaviour must survive the dedupe.
    const onlyFailed = latestSentAt([{ sent_at: null, status: "FAILED" }])
    expect(alreadyContactedOn(onlyFailed, "2026-07-01")).toBe(false)
  })
})

// The invariant that broke when the FAILED window was widened: one message per invoice
// per day, across ALL ten slots. The unit tests above cover each helper in isolation, but
// the duplicate lived in the seam between them — Phase 1 sending from a row dated earlier
// than today, then Phase 2 not recognising that send. This models the two phases over a
// full reminder day, mirroring ensureOverdueCatchUpReminder's real row bookkeeping.
describe("one message per invoice per day (Phase 1 + Phase 2 over ten slots)", () => {
  type Row = {
    reminder_number: number
    scheduled_date: string
    status: string
    sent_at: string | null
    first_failed_on?: string | null
  }

  /** Returns how many messages the invoice would receive across the day. */
  function runDay(options: {
    today: string
    rows: Row[]
    chaseEligible: boolean
    /** Slot numbers on which the WhatsApp send fails. */
    failOnSlots?: number[]
  }): number {
    const { today, chaseEligible, failOnSlots = [] } = options
    const rows = options.rows.map((r) => ({ ...r }))
    const failedRetryFrom = failedRetryWindowStart(today, REMINDER_FAILED_RETRY_WINDOW_DAYS)
    let messages = 0

    const send = (row: Row, slot: number) => {
      messages++
      if (failOnSlots.includes(slot)) {
        row.status = "FAILED"
        // Mirrors _markReminderFailed: stamped once, never refreshed.
        row.first_failed_on = row.first_failed_on ?? today
      } else {
        row.status = "SENT"
        // Stamped at send time, NOT at the row's scheduled_date — the detail the
        // scheduled_date-based dedupe missed.
        row.sent_at = `${today}T02:00:00Z`
      }
    }

    for (let slot = 1; slot <= 10; slot++) {
      const processed = new Set<number>()

      // ── Phase 1: discovery, then latest-due selection ──
      const discovered = rows.some((r) =>
        isPhase1DueReminder(
          { ...r, first_failed_on: r.first_failed_on ?? null },
          { today, failedRetryFrom }
        )
      )
      if (discovered) {
        const { target } = selectReminderToSend(rows, { today, ignoreSchedule: false })
        if (target) {
          processed.add(1)
          send(target as Row, slot)
        }
      }

      // ── Phase 2: overdue chase, slots 3+ ──
      if (slot < 3 || !chaseEligible || processed.has(1)) continue
      if (alreadyContactedOn(latestSentAt(rows), today)) continue

      // ensureOverdueCatchUpReminder: reuse today's row, or write a new one.
      const todayRow = [...rows]
        .filter((r) => r.scheduled_date === today)
        .sort((a, b) => b.reminder_number - a.reminder_number)[0]
      if (todayRow?.status === "SENT") continue
      if (todayRow && (todayRow.status === "PENDING" || todayRow.status === "FAILED")) {
        send(todayRow, slot)
        continue
      }
      const fresh: Row = {
        reminder_number: Math.max(...rows.map((r) => r.reminder_number)) + 1,
        scheduled_date: today,
        status: "PENDING",
        sent_at: null,
      }
      rows.push(fresh)
      send(fresh, slot)
    }

    return messages
  }

  it("sends exactly once when Phase 1 retries a FAILED row dated an earlier day", () => {
    // The regression. An arrears invoice whose 21 Jun send failed, picked up on 1 Jul:
    // Phase 1 sends from the 06-21 row, and every later slot's chase must stand down.
    expect(
      runDay({
        today: "2026-07-01",
        chaseEligible: true,
        rows: [
          { reminder_number: 1, scheduled_date: "2026-06-01", status: "SENT", sent_at: "2026-06-01T02:00:00Z" },
          { reminder_number: 2, scheduled_date: "2026-06-11", status: "SENT", sent_at: "2026-06-11T02:00:00Z" },
          { reminder_number: 3, scheduled_date: "2026-06-21", status: "FAILED", sent_at: null },
        ],
      })
    ).toBe(1)
  })

  it("sends exactly once for the latent stranded-PENDING variant", () => {
    // Same seam, reachable before this change whenever a cron slot was missed.
    expect(
      runDay({
        today: "2026-07-01",
        chaseEligible: true,
        rows: [
          { reminder_number: 1, scheduled_date: "2026-06-21", status: "PENDING", sent_at: null },
        ],
      })
    ).toBe(1)
  })

  it("sends exactly once on a plain chase with no reminder rows due", () => {
    expect(
      runDay({
        today: "2026-07-01",
        chaseEligible: true,
        rows: [
          { reminder_number: 1, scheduled_date: "2026-06-01", status: "SENT", sent_at: "2026-06-01T02:00:00Z" },
        ],
      })
    ).toBe(1)
  })

  it("keeps retrying within the day when the send itself fails", () => {
    // The guard must not suppress same-day retries: a FAILED row has no sent_at, so
    // alreadyContactedOn stays false and later slots try again.
    const messages = runDay({
      today: "2026-07-01",
      chaseEligible: true,
      failOnSlots: [1, 2, 3, 4],
      rows: [
        { reminder_number: 1, scheduled_date: "2026-06-21", status: "FAILED", sent_at: null },
      ],
    })
    expect(messages).toBeGreaterThan(1)
  })

  it("settles to exactly one message once a retry finally succeeds", () => {
    // Fails on slots 1–2, succeeds on slot 3, then silence for the remaining seven.
    const messages = runDay({
      today: "2026-07-01",
      chaseEligible: true,
      failOnSlots: [1, 2],
      rows: [
        { reminder_number: 1, scheduled_date: "2026-06-21", status: "FAILED", sent_at: null },
      ],
    })
    expect(messages).toBe(3)
  })

  it("sends exactly once for a normal current-month reminder day", () => {
    expect(
      runDay({
        today: "2026-07-01",
        chaseEligible: false,
        rows: [
          { reminder_number: 1, scheduled_date: "2026-07-01", status: "PENDING", sent_at: null },
          { reminder_number: 2, scheduled_date: "2026-07-11", status: "PENDING", sent_at: null },
          { reminder_number: 3, scheduled_date: "2026-07-21", status: "PENDING", sent_at: null },
        ],
      })
    ).toBe(1)
  })
})
