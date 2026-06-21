import {
  ALL_SUBJECTS,
  SUBJECT_LABELS,
  SCHOOL_LEVEL_LABELS,
  type KumonSubject,
  type SchoolLevel,
} from "@/lib/billing/fees"
import { gradeToSchoolLevel, type StudentGrade } from "@/lib/billing/grades"

// Pure subject/level mix snapshot for currently-billable students: how many
// enrollments per subject and how the student body splits by school level.

export interface SubjectMixRow {
  grade: StudentGrade
  subjects: KumonSubject[]
}

export interface SubjectCount {
  subject: KumonSubject
  label: string
  count: number
}

export interface LevelCount {
  level: SchoolLevel
  label: string
  count: number
}

export interface SubjectMixData {
  totalStudents: number
  bySubject: SubjectCount[]
  byLevel: LevelCount[]
}

const ALL_LEVELS: SchoolLevel[] = ["ELEMENTARY", "SECONDARY"]

export function buildSubjectMix(rows: SubjectMixRow[]): SubjectMixData {
  const subjectCounts = new Map<KumonSubject, number>(ALL_SUBJECTS.map((s) => [s, 0]))
  const levelCounts = new Map<SchoolLevel, number>(ALL_LEVELS.map((l) => [l, 0]))

  for (const row of rows) {
    levelCounts.set(
      gradeToSchoolLevel(row.grade),
      levelCounts.get(gradeToSchoolLevel(row.grade))! + 1
    )
    for (const subject of row.subjects) {
      subjectCounts.set(subject, (subjectCounts.get(subject) ?? 0) + 1)
    }
  }

  return {
    totalStudents: rows.length,
    bySubject: ALL_SUBJECTS.map((subject) => ({
      subject,
      label: SUBJECT_LABELS[subject],
      count: subjectCounts.get(subject)!,
    })),
    byLevel: ALL_LEVELS.map((level) => ({
      level,
      label: SCHOOL_LEVEL_LABELS[level],
      count: levelCounts.get(level)!,
    })),
  }
}
