import { describe, it, expect } from "vitest"
import {
  buildEnrollmentChurnSeries,
  summarizeEnrollmentChurn,
  type StudentLifecycleRow,
} from "@/lib/reports/enrollment-churn"

const JUNE = new Date("2026-06-17T05:00:00Z") // June 2026 WIB

function row(partial: Partial<StudentLifecycleRow> = {}): StudentLifecycleRow {
  return { enrolled_at: "2026-06-01", deactivated_at: null, ...partial }
}

describe("summarizeEnrollmentChurn", () => {
  it("counts joins and churn for the current month with net", () => {
    const data = summarizeEnrollmentChurn(
      [
        row({ enrolled_at: "2026-06-10" }),
        row({ enrolled_at: "2026-06-20" }),
        row({ enrolled_at: "2026-01-01", deactivated_at: "2026-06-15T03:00:00Z" }),
      ],
      "this_month",
      JUNE
    )
    expect(data.joined).toBe(2)
    expect(data.churned).toBe(1)
    expect(data.net).toBe(1)
    expect(data.points).toHaveLength(1)
    expect(data.points[0]).toMatchObject({ month: 6, year: 2026, joined: 2, churned: 1, net: 1 })
  })

  it("excludes events outside the period window", () => {
    const data = summarizeEnrollmentChurn(
      [row({ enrolled_at: "2026-01-05" })], // January, outside this_month
      "this_month",
      JUNE
    )
    expect(data.joined).toBe(0)
  })
})

describe("buildEnrollmentChurnSeries — WIB churn bucketing", () => {
  const JULY = new Date("2026-07-15T05:00:00Z") // window Jan..Jul for ytd

  it("buckets deactivated_at by its WIB month, not its UTC month", () => {
    // 2026-06-30 17:30 UTC === 2026-07-01 00:30 WIB → counts in July.
    const points = buildEnrollmentChurnSeries(
      [row({ enrolled_at: "2026-01-01", deactivated_at: "2026-06-30T17:30:00Z" })],
      "ytd",
      JULY
    )
    const june = points.find((p) => p.month === 6)!
    const july = points.find((p) => p.month === 7)!
    expect(june.churned).toBe(0)
    expect(july.churned).toBe(1)
  })

  it("keeps a same-WIB-day timestamp in its own month", () => {
    const points = buildEnrollmentChurnSeries(
      [row({ enrolled_at: "2026-01-01", deactivated_at: "2026-06-15T10:00:00Z" })],
      "ytd",
      JULY
    )
    expect(points.find((p) => p.month === 6)!.churned).toBe(1)
  })
})

describe("activeAtEnd (cumulative active students)", () => {
  const JULY = new Date("2026-07-15T05:00:00Z") // ytd window Jan..Jul

  it("counts students enrolled on/before a month and not yet churned", () => {
    const points = buildEnrollmentChurnSeries(
      [
        // enrolled before the window → still counts toward active in-window
        row({ enrolled_at: "2025-11-01" }),
        row({ enrolled_at: "2026-03-10" }),
      ],
      "ytd",
      JULY
    )
    const byMonth = Object.fromEntries(points.map((p) => [p.month, p.activeAtEnd]))
    expect(byMonth[1]).toBe(1) // Jan: only the 2025 student
    expect(byMonth[2]).toBe(1)
    expect(byMonth[3]).toBe(2) // March: both active
    expect(byMonth[7]).toBe(2)
  })

  it("drops a churned student the month after its WIB churn month", () => {
    const points = buildEnrollmentChurnSeries(
      [row({ enrolled_at: "2026-01-01", deactivated_at: "2026-04-10T03:00:00Z" })],
      "ytd",
      JULY
    )
    const byMonth = Object.fromEntries(points.map((p) => [p.month, p.activeAtEnd]))
    expect(byMonth[3]).toBe(1) // still active end of March
    expect(byMonth[4]).toBe(0) // churned during April → not active at end of April
    expect(byMonth[5]).toBe(0)
  })

  it("summary currentActive equals the last month's activeAtEnd", () => {
    const data = summarizeEnrollmentChurn(
      [
        row({ enrolled_at: "2026-01-01" }),
        row({ enrolled_at: "2026-02-01", deactivated_at: "2026-06-10T03:00:00Z" }),
      ],
      "ytd",
      JULY
    )
    expect(data.currentActive).toBe(1)
    expect(data.points[data.points.length - 1].activeAtEnd).toBe(1)
  })
})

describe("buildEnrollmentChurnSeries — all_time", () => {
  it("anchors the series to the earliest join or churn event", () => {
    const points = buildEnrollmentChurnSeries(
      [
        row({ enrolled_at: "2026-04-01" }),
        row({ enrolled_at: "2026-01-01", deactivated_at: "2026-05-10T03:00:00Z" }),
      ],
      "all_time",
      JUNE
    )
    expect(points[0]).toMatchObject({ month: 1, year: 2026 })
    expect(points[points.length - 1]).toMatchObject({ month: 6, year: 2026 })
  })
})
