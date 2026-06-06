import type { SchoolLevel } from "@/lib/billing/fees"

export type StudentGrade =
  | "TK_1"
  | "TK_2"
  | "SD_1"
  | "SD_2"
  | "SD_3"
  | "SD_4"
  | "SD_5"
  | "SD_6"
  | "SMP_1"
  | "SMP_2"
  | "SMP_3"
  | "SMA_1"
  | "SMA_2"
  | "SMA_3"

export const ALL_GRADES = [
  "TK_1",
  "TK_2",
  "SD_1",
  "SD_2",
  "SD_3",
  "SD_4",
  "SD_5",
  "SD_6",
  "SMP_1",
  "SMP_2",
  "SMP_3",
  "SMA_1",
  "SMA_2",
  "SMA_3",
] as const satisfies readonly StudentGrade[]

export const GRADE_LABELS: Record<StudentGrade, string> = {
  TK_1: "TK 1",
  TK_2: "TK 2",
  SD_1: "SD 1",
  SD_2: "SD 2",
  SD_3: "SD 3",
  SD_4: "SD 4",
  SD_5: "SD 5",
  SD_6: "SD 6",
  SMP_1: "SMP 1",
  SMP_2: "SMP 2",
  SMP_3: "SMP 3",
  SMA_1: "SMA 1",
  SMA_2: "SMA 2",
  SMA_3: "SMA 3",
}

const GRADE_LADDER: Record<StudentGrade, StudentGrade> = {
  TK_1: "TK_2",
  TK_2: "SD_1",
  SD_1: "SD_2",
  SD_2: "SD_3",
  SD_3: "SD_4",
  SD_4: "SD_5",
  SD_5: "SD_6",
  SD_6: "SMP_1",
  SMP_1: "SMP_2",
  SMP_2: "SMP_3",
  SMP_3: "SMA_1",
  SMA_1: "SMA_2",
  SMA_2: "SMA_3",
  SMA_3: "SMA_3",
}

export function gradeLabel(grade: StudentGrade): string {
  return GRADE_LABELS[grade]
}

export function gradeToSchoolLevel(grade: StudentGrade): SchoolLevel {
  if (grade.startsWith("SMP_") || grade.startsWith("SMA_")) return "SECONDARY"
  return "ELEMENTARY"
}

export function nextGrade(grade: StudentGrade): StudentGrade {
  return GRADE_LADDER[grade]
}

export function isStudentGrade(value: string): value is StudentGrade {
  return (ALL_GRADES as readonly string[]).includes(value)
}

export const GRADE_PROMOTION_MONTH = 7

export function isGradePromotionMonth(month: number): boolean {
  return month === GRADE_PROMOTION_MONTH
}
