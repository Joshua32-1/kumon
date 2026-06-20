import { describe, it, expect } from "vitest"
import { buildSubjectMix, type SubjectMixRow } from "@/lib/reports/subject-mix"

describe("buildSubjectMix", () => {
  it("counts subjects and school levels across students", () => {
    const rows: SubjectMixRow[] = [
      { grade: "SD_3", subjects: ["ENGLISH", "MATHEMATICS"] }, // elementary
      { grade: "TK_1", subjects: ["MATHEMATICS"] }, // elementary
      { grade: "SMP_2", subjects: ["ENGLISH", "INDONESIAN", "MATHEMATICS"] }, // secondary
    ]
    const mix = buildSubjectMix(rows)

    expect(mix.totalStudents).toBe(3)

    const subj = Object.fromEntries(mix.bySubject.map((s) => [s.subject, s.count]))
    expect(subj).toEqual({ ENGLISH: 2, INDONESIAN: 1, MATHEMATICS: 3 })

    const level = Object.fromEntries(mix.byLevel.map((l) => [l.level, l.count]))
    expect(level).toEqual({ ELEMENTARY: 2, SECONDARY: 1 })
  })

  it("always reports all three subjects and both levels, even at zero", () => {
    const mix = buildSubjectMix([{ grade: "SD_1", subjects: ["ENGLISH"] }])
    expect(mix.bySubject.map((s) => s.subject)).toEqual([
      "ENGLISH",
      "INDONESIAN",
      "MATHEMATICS",
    ])
    expect(mix.bySubject.find((s) => s.subject === "INDONESIAN")?.count).toBe(0)
    expect(mix.byLevel.find((l) => l.level === "SECONDARY")?.count).toBe(0)
  })

  it("returns zeroed counts for empty input", () => {
    const mix = buildSubjectMix([])
    expect(mix.totalStudents).toBe(0)
    expect(mix.bySubject.every((s) => s.count === 0)).toBe(true)
    expect(mix.byLevel.every((l) => l.count === 0)).toBe(true)
  })
})
