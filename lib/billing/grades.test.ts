import { describe, it, expect } from "vitest"
import {
  gradeToSchoolLevel,
  nextGrade,
  isStudentGrade,
  isGradePromotionMonth,
  ALL_GRADES,
} from "@/lib/billing/grades"

describe("gradeToSchoolLevel", () => {
  it("maps TK/SD grades to ELEMENTARY", () => {
    expect(gradeToSchoolLevel("TK_1")).toBe("ELEMENTARY")
    expect(gradeToSchoolLevel("SD_6")).toBe("ELEMENTARY")
  })

  it("maps SMP/SMA grades to SECONDARY", () => {
    expect(gradeToSchoolLevel("SMP_1")).toBe("SECONDARY")
    expect(gradeToSchoolLevel("SMA_3")).toBe("SECONDARY")
  })
})

describe("nextGrade", () => {
  it("advances one rung along the ladder", () => {
    expect(nextGrade("TK_1")).toBe("TK_2")
    expect(nextGrade("SD_6")).toBe("SMP_1")
    expect(nextGrade("SMP_3")).toBe("SMA_1")
  })

  it("caps at the top grade (SMA_3 → SMA_3)", () => {
    expect(nextGrade("SMA_3")).toBe("SMA_3")
  })

  it("produces a valid grade for every grade", () => {
    for (const grade of ALL_GRADES) {
      expect(isStudentGrade(nextGrade(grade))).toBe(true)
    }
  })
})

describe("isStudentGrade", () => {
  it("accepts valid grade labels and rejects junk", () => {
    expect(isStudentGrade("SD_3")).toBe(true)
    expect(isStudentGrade("KINDERGARTEN")).toBe(false)
    expect(isStudentGrade("")).toBe(false)
  })
})

describe("isGradePromotionMonth", () => {
  it("is true only for July", () => {
    expect(isGradePromotionMonth(7)).toBe(true)
    expect(isGradePromotionMonth(6)).toBe(false)
    expect(isGradePromotionMonth(8)).toBe(false)
  })
})
