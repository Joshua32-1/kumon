import { createSupabaseServerClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { Errors } from "@/lib/errors"
import { todayInCenterTimezone, currentMonthYearInCenterTimezone } from "@/lib/utils"
import { gradeToSchoolLevel } from "@/lib/billing/grades"
import {
  getCurrentLeaveStreakPeriod,
  currentConsecutiveLeaveStreak,
  needsLeaveReview,
  parseMaxLeaveMonthsConfig,
  type LeaveMonth,
} from "@/lib/billing/leaves"
import type {
  Student,
  StudentDetail,
  StudentFilters,
  CreateStudentInput,
  UpdateStudentInput,
  UpdateEnrollmentInput,
  UpdateContactInput,
  TemporaryLeave,
  StudentSubject,
  Contact,
  PromoteGradesResult,
  LeaveReviewAlert,
  LeaveReviewListResult,
  LeaveReviewStudent,
  SetLeaveBulkResult,
  BulkLeaveUnpaidInvoice,
} from "./types"

type StudentSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

function buildLeaveReviewAlert(
  leaves: LeaveMonth[],
  maxConsecutive: number
): LeaveReviewAlert | null {
  if (!needsLeaveReview(leaves, maxConsecutive)) return null
  const period = getCurrentLeaveStreakPeriod(leaves)
  if (!period) return null

  return {
    consecutive_months: currentConsecutiveLeaveStreak(leaves),
    max_consecutive_months: maxConsecutive,
    period_start_month: period.start.month,
    period_start_year: period.start.year,
    period_end_month: period.end.month,
    period_end_year: period.end.year,
  }
}

export const studentService = {
  async list(filters: StudentFilters = {}): Promise<Student[]> {
    const supabase = await createSupabaseServerClient()

    let query = supabase
      .from("students")
      .select("*")
      .order("full_name", { ascending: true })

    if (filters.status) {
      query = query.eq("status", filters.status)
    }
    if (filters.search) {
      query = query.ilike("full_name", `%${filters.search}%`)
    }

    const { data, error } = await query
    if (error) throw Errors.INTERNAL(error.message)
    return data as Student[]
  },

  async getById(id: string): Promise<StudentDetail> {
    const supabase = await createSupabaseServerClient()

    const { data: student, error } = await supabase
      .from("students")
      .select("*")
      .eq("id", id)
      .single()

    if (error || !student) throw Errors.STUDENT_NOT_FOUND()

    const [{ data: contacts }, { data: leaves }, { data: subjects }] = await Promise.all([
      supabase.from("contacts").select("*").eq("student_id", id).order("is_primary", { ascending: false }),
      supabase
        .from("temporary_leaves")
        .select("*")
        .eq("student_id", id)
        .order("year", { ascending: false })
        .order("month", { ascending: false }),
      supabase.from("student_subjects").select("*").eq("student_id", id),
    ])

    const leaveMonths = (leaves ?? []).map((l) => ({ month: l.month, year: l.year }))
    const maxConsecutive = await studentService.getMaxConsecutiveLeaveMonths(supabase)
    const leave_review =
      (student as Student).status === "TEMPORARY_LEAVE"
        ? buildLeaveReviewAlert(leaveMonths, maxConsecutive)
        : null

    return {
      ...(student as Student),
      contacts: (contacts ?? []) as StudentDetail["contacts"],
      active_leaves: (leaves ?? []) as TemporaryLeave[],
      subjects: (subjects ?? []) as StudentSubject[],
      leave_review,
    }
  },

  async getMaxConsecutiveLeaveMonths(
    supabase?: StudentSupabase | typeof supabaseAdmin
  ): Promise<number> {
    const db = supabase ?? (await createSupabaseServerClient())
    const { data } = await db
      .from("system_config")
      .select("value")
      .eq("key", "max_leave_months")
      .single()
    return parseMaxLeaveMonthsConfig(data?.value)
  },

  /**
   * Students on cuti whose latest consecutive leave streak meets or exceeds
   * `max_leave_months` (calendar-adjacent months, not total months on leave).
   */
  async listLeaveReviewAlerts(
    supabase?: StudentSupabase | typeof supabaseAdmin
  ): Promise<LeaveReviewListResult> {
    const db = supabase ?? (await createSupabaseServerClient())
    const max_consecutive_months = await studentService.getMaxConsecutiveLeaveMonths(db)

    const { data: students, error: studentsError } = await db
      .from("students")
      .select("id, full_name, status")
      .eq("status", "TEMPORARY_LEAVE")
      .order("full_name", { ascending: true })

    if (studentsError) throw Errors.INTERNAL(studentsError.message)
    if (!students?.length) {
      return { max_consecutive_months, students: [] }
    }

    const studentIds = students.map((s) => s.id)
    const { data: leaveRows, error: leavesError } = await db
      .from("temporary_leaves")
      .select("student_id, month, year")
      .in("student_id", studentIds)

    if (leavesError) throw Errors.INTERNAL(leavesError.message)

    const leavesByStudent = new Map<string, LeaveMonth[]>()
    for (const row of leaveRows ?? []) {
      const list = leavesByStudent.get(row.student_id) ?? []
      list.push({ month: row.month, year: row.year })
      leavesByStudent.set(row.student_id, list)
    }

    const flagged: LeaveReviewStudent[] = []

    for (const student of students) {
      const months = leavesByStudent.get(student.id) ?? []
      const alert = buildLeaveReviewAlert(months, max_consecutive_months)
      if (!alert) continue

      flagged.push({
        id: student.id,
        full_name: student.full_name,
        status: student.status as LeaveReviewStudent["status"],
        consecutive_months: alert.consecutive_months,
        max_consecutive_months: alert.max_consecutive_months,
        period_start_month: alert.period_start_month,
        period_start_year: alert.period_start_year,
        period_end_month: alert.period_end_month,
        period_end_year: alert.period_end_year,
      })
    }

    return { max_consecutive_months, students: flagged }
  },

  async create(input: CreateStudentInput): Promise<Student> {
    const supabase = await createSupabaseServerClient()

    const school_level = gradeToSchoolLevel(input.grade)

    const { data: student, error: studentError } = await supabase
      .from("students")
      .insert({
        full_name: input.full_name,
        grade: input.grade,
        school_level,
        enrolled_at: input.enrolled_at ?? todayInCenterTimezone(),
        notes: input.notes ?? null,
      })
      .select()
      .single()

    if (studentError || !student) throw Errors.INTERNAL(studentError?.message)

    const { error: contactError } = await supabase.from("contacts").insert({
      student_id: student.id,
      full_name: input.contact.full_name,
      relationship: input.contact.relationship,
      whatsapp_number: input.contact.whatsapp_number,
      is_primary: true,
    })

    if (contactError) {
      await supabase.from("students").delete().eq("id", student.id)
      throw Errors.INTERNAL(contactError.message)
    }

    const subjectRows = input.subjects.map((subject) => ({
      student_id: student.id,
      subject,
      enrolled_at: input.enrolled_at ?? todayInCenterTimezone(),
    }))

    const { error: subjectError } = await supabase.from("student_subjects").insert(subjectRows)

    if (subjectError) {
      await supabase.from("students").delete().eq("id", student.id)
      throw Errors.INTERNAL(subjectError.message)
    }

    return student as Student
  },

  async update(id: string, input: UpdateStudentInput): Promise<Student> {
    const supabase = await createSupabaseServerClient()

    const payload: UpdateStudentInput & { school_level?: import("@/lib/billing/fees").SchoolLevel } =
      { ...input }
    if (input.grade) {
      payload.school_level = gradeToSchoolLevel(input.grade)
    }

    const { data, error } = await supabase
      .from("students")
      .update(payload)
      .eq("id", id)
      .select()
      .single()

    if (error || !data) throw Errors.STUDENT_NOT_FOUND()
    return data as Student
  },

  async updatePrimaryContact(studentId: string, input: UpdateContactInput): Promise<Contact> {
    const supabase = await createSupabaseServerClient()

    const { data: contact, error: fetchError } = await supabase
      .from("contacts")
      .select("*")
      .eq("student_id", studentId)
      .eq("is_primary", true)
      .maybeSingle()

    if (fetchError) throw Errors.INTERNAL(fetchError.message)
    if (!contact) throw Errors.STUDENT_NOT_FOUND()

    const { data, error } = await supabase
      .from("contacts")
      .update({
        full_name: input.full_name,
        relationship: input.relationship,
        whatsapp_number: input.whatsapp_number,
      })
      .eq("id", contact.id)
      .select()
      .single()

    if (error || !data) throw Errors.INTERNAL(error?.message)
    return data as Contact
  },

  async updateEnrollment(id: string, input: UpdateEnrollmentInput): Promise<void> {
    const supabase = await createSupabaseServerClient()

    if (input.subjects && input.subjects.length > 0) {
      await supabase.from("student_subjects").delete().eq("student_id", id)

      const subjectRows = input.subjects.map((subject) => ({
        student_id: id,
        subject,
        enrolled_at: todayInCenterTimezone(),
      }))
      const { error } = await supabase.from("student_subjects").insert(subjectRows)
      if (error) throw Errors.INTERNAL(error.message)
    }
  },

  async deactivate(id: string): Promise<void> {
    const supabase = await createSupabaseServerClient()

    const { error } = await supabase
      .from("students")
      .update({ status: "INACTIVE", deactivated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) throw Errors.STUDENT_NOT_FOUND()
  },

  async reactivate(id: string): Promise<void> {
    const supabase = await createSupabaseServerClient()

    const { error } = await supabase
      .from("students")
      .update({ status: "ACTIVE", deactivated_at: null })
      .eq("id", id)
      .eq("status", "INACTIVE")

    if (error) throw Errors.STUDENT_NOT_FOUND()
  },

  async setLeave(
    studentId: string,
    month: number,
    year: number,
    reason?: string
  ): Promise<TemporaryLeave> {
    const supabase = await createSupabaseServerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from("temporary_leaves")
      .insert({ student_id: studentId, month, year, reason: reason ?? null, created_by: user?.id ?? null })
      .select()
      .single()

    if (error) {
      if (error.code === "23505") throw Errors.LEAVE_EXISTS()
      throw Errors.INTERNAL(error.message)
    }

    // Status reflects the current WIB month only; future/past leaves don't change it.
    const { month: currentMonth, year: currentYear } = currentMonthYearInCenterTimezone()
    if (month === currentMonth && year === currentYear) {
      await supabase
        .from("students")
        .update({ status: "TEMPORARY_LEAVE" })
        .eq("id", studentId)
        .eq("status", "ACTIVE")
    }

    return data as TemporaryLeave
  },

  async cancelLeave(
    leaveId: string
  ): Promise<{ student_id: string; month: number; year: number }> {
    const supabase = await createSupabaseServerClient()

    const { data: leave, error: fetchError } = await supabase
      .from("temporary_leaves")
      .select("student_id, month, year")
      .eq("id", leaveId)
      .single()

    if (fetchError || !leave) throw Errors.LEAVE_NOT_FOUND()

    const { error } = await supabase
      .from("temporary_leaves")
      .delete()
      .eq("id", leaveId)

    if (error) throw Errors.INTERNAL(error.message)

    // Revert to ACTIVE only when no leave remains for the current WIB month;
    // historical rows are kept (leave-review streaks and history depend on them).
    const { month, year } = currentMonthYearInCenterTimezone()
    const { count } = await supabase
      .from("temporary_leaves")
      .select("*", { count: "exact", head: true })
      .eq("student_id", leave.student_id)
      .eq("month", month)
      .eq("year", year)

    if (count === 0) {
      await supabase
        .from("students")
        .update({ status: "ACTIVE" })
        .eq("id", leave.student_id)
        .eq("status", "TEMPORARY_LEAVE")
    }

    // The leave period comes from the DB row, not the caller — the action layer
    // uses it for invoice regeneration and must not trust client month/year.
    return { student_id: leave.student_id, month: leave.month, year: leave.year }
  },

  /**
   * Records the same leave month for many students at once. Students who
   * already have a leave for that month are skipped, not failed.
   */
  async setLeaveBulk(
    studentIds: string[],
    month: number,
    year: number,
    reason?: string
  ): Promise<SetLeaveBulkResult> {
    const supabase = await createSupabaseServerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data: eligible, error: eligibleError } = await supabase
      .from("students")
      .select("id")
      .in("id", studentIds)
      .in("status", ["ACTIVE", "TEMPORARY_LEAVE"])

    if (eligibleError) throw Errors.INTERNAL(eligibleError.message)

    const eligibleIds = (eligible ?? []).map((s) => s.id)
    const skippedIneligible = studentIds.length - eligibleIds.length

    if (eligibleIds.length === 0) {
      return {
        created: 0,
        skipped_existing: 0,
        skipped_ineligible: skippedIneligible,
        unpaid_invoices: [],
        cancelled_invoices: [],
        paid_invoices: [],
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from("temporary_leaves")
      .upsert(
        eligibleIds.map((id) => ({
          student_id: id,
          month,
          year,
          reason: reason ?? null,
          created_by: user?.id ?? null,
        })),
        { onConflict: "student_id,month,year", ignoreDuplicates: true }
      )
      .select("student_id")

    if (insertError) throw Errors.INTERNAL(insertError.message)

    const created = inserted?.length ?? 0

    const { month: currentMonth, year: currentYear } = currentMonthYearInCenterTimezone()
    if (month === currentMonth && year === currentYear) {
      await supabase
        .from("students")
        .update({ status: "TEMPORARY_LEAVE" })
        .in("id", eligibleIds)
        .eq("status", "ACTIVE")
    }

    const { data: invoiceRows } = await supabase
      .from("invoices")
      .select("id, student_id, amount, status, students(full_name)")
      .eq("month", month)
      .eq("year", year)
      .in("student_id", eligibleIds)
      .in("status", ["PENDING", "OVERDUE", "PAID"])

    const reported: BulkLeaveUnpaidInvoice[] = (invoiceRows ?? []).map((row) => ({
      invoice_id: row.id,
      student_id: row.student_id,
      student_name: (row.students as unknown as { full_name: string } | null)?.full_name ?? "",
      amount: row.amount,
      status: row.status as BulkLeaveUnpaidInvoice["status"],
    }))

    return {
      created,
      skipped_existing: eligibleIds.length - created,
      skipped_ineligible: skippedIneligible,
      unpaid_invoices: reported.filter((inv) => inv.status !== "PAID"),
      // Filled by the action when the admin opted into cancellation.
      cancelled_invoices: [],
      paid_invoices: reported.filter((inv) => inv.status === "PAID"),
    }
  },

  /**
   * Daily cron sync: status is TEMPORARY_LEAVE iff a leave row exists for the
   * current WIB month. INACTIVE students are never touched. Idempotent.
   */
  async syncLeaveStatuses(): Promise<{
    month: number
    year: number
    marked_on_leave: number
    reactivated: number
  }> {
    const { month, year } = currentMonthYearInCenterTimezone()

    const { data: leaves, error: leavesError } = await supabaseAdmin
      .from("temporary_leaves")
      .select("student_id")
      .eq("month", month)
      .eq("year", year)

    if (leavesError) throw Errors.INTERNAL(leavesError.message)

    const onLeaveIds = [...new Set((leaves ?? []).map((l) => l.student_id))]

    let markedOnLeave = 0
    if (onLeaveIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("students")
        .update({ status: "TEMPORARY_LEAVE" })
        .eq("status", "ACTIVE")
        .in("id", onLeaveIds)
        .select("id")

      if (error) throw Errors.INTERNAL(error.message)
      markedOnLeave = data?.length ?? 0
    }

    let reactivateQuery = supabaseAdmin
      .from("students")
      .update({ status: "ACTIVE" })
      .eq("status", "TEMPORARY_LEAVE")

    if (onLeaveIds.length > 0) {
      // UUID list goes into the PostgREST query string — fine at single-center
      // scale (tens of concurrent leaves), revisit if that assumption breaks.
      reactivateQuery = reactivateQuery.not(
        "id",
        "in",
        `(${onLeaveIds.map((id) => `"${id}"`).join(",")})`
      )
    }

    const { data: reactivatedRows, error: reactivateError } = await reactivateQuery.select("id")

    if (reactivateError) throw Errors.INTERNAL(reactivateError.message)

    return {
      month,
      year,
      marked_on_leave: markedOnLeave,
      reactivated: reactivatedRows?.length ?? 0,
    }
  },

  /** Annual July 1 promotion for ACTIVE and TEMPORARY_LEAVE students (idempotent per promotion year). */
  async promoteGradesAnnual(promotionYear: number): Promise<PromoteGradesResult> {
    const { data, error } = await supabaseAdmin.rpc("promote_grades_annual", {
      p_promotion_year: promotionYear,
    })

    if (error) {
      // 23514 = check_violation: the year guard rejected an out-of-range promotion year.
      if (error.code === "23514") throw Errors.BAD_REQUEST(error.message)
      throw Errors.INTERNAL(error.message)
    }

    const result = data as PromoteGradesResult | null
    if (!result) throw Errors.INTERNAL("Grade promotion returned no result")

    return {
      promotion_year: result.promotion_year,
      already_promoted: result.already_promoted,
      promoted: result.promoted,
      unchanged: result.unchanged,
      skipped_inactive: result.skipped_inactive,
    }
  },
}
