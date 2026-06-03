import { createSupabaseServerClient } from "@/lib/supabase/server"
import { Errors } from "@/lib/errors"
import type {
  Student,
  StudentDetail,
  StudentFilters,
  CreateStudentInput,
  UpdateStudentInput,
  TemporaryLeave,
} from "./types"

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

    const [{ data: contacts }, { data: leaves }] = await Promise.all([
      supabase.from("contacts").select("*").eq("student_id", id).order("is_primary", { ascending: false }),
      supabase
        .from("temporary_leaves")
        .select("*")
        .eq("student_id", id)
        .order("year", { ascending: false })
        .order("month", { ascending: false }),
    ])

    return {
      ...(student as Student),
      contacts: (contacts ?? []) as StudentDetail["contacts"],
      active_leaves: (leaves ?? []) as TemporaryLeave[],
    }
  },

  async create(input: CreateStudentInput): Promise<Student> {
    const supabase = await createSupabaseServerClient()

    const { data: student, error: studentError } = await supabase
      .from("students")
      .insert({
        full_name: input.full_name,
        grade: input.grade ?? null,
        enrolled_at: input.enrolled_at ?? new Date().toISOString().split("T")[0],
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
      // Roll back student if contact fails
      await supabase.from("students").delete().eq("id", student.id)
      throw Errors.INTERNAL(contactError.message)
    }

    return student as Student
  },

  async update(id: string, input: UpdateStudentInput): Promise<Student> {
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
      .from("students")
      .update(input)
      .eq("id", id)
      .select()
      .single()

    if (error || !data) throw Errors.STUDENT_NOT_FOUND()
    return data as Student
  },

  async deactivate(id: string): Promise<void> {
    const supabase = await createSupabaseServerClient()

    const { error } = await supabase
      .from("students")
      .update({ status: "INACTIVE", deactivated_at: new Date().toISOString() })
      .eq("id", id)

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

    // Update student status if ACTIVE
    await supabase
      .from("students")
      .update({ status: "TEMPORARY_LEAVE" })
      .eq("id", studentId)
      .eq("status", "ACTIVE")

    return data as TemporaryLeave
  },

  async cancelLeave(leaveId: string): Promise<void> {
    const supabase = await createSupabaseServerClient()

    const { data: leave, error: fetchError } = await supabase
      .from("temporary_leaves")
      .select("student_id")
      .eq("id", leaveId)
      .single()

    if (fetchError || !leave) throw Errors.LEAVE_NOT_FOUND()

    const { error } = await supabase
      .from("temporary_leaves")
      .delete()
      .eq("id", leaveId)

    if (error) throw Errors.INTERNAL(error.message)

    // If no more leaves remain, restore to ACTIVE
    const { count } = await supabase
      .from("temporary_leaves")
      .select("*", { count: "exact", head: true })
      .eq("student_id", leave.student_id)

    if (count === 0) {
      await supabase
        .from("students")
        .update({ status: "ACTIVE" })
        .eq("id", leave.student_id)
        .eq("status", "TEMPORARY_LEAVE")
    }
  },

  async checkOverdueLeaves(): Promise<Student[]> {
    const supabase = await createSupabaseServerClient()

    const { data: students } = await supabase
      .from("students")
      .select("*")
      .eq("status", "TEMPORARY_LEAVE")

    if (!students) return []

    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    const overdue: Student[] = []

    for (const student of students) {
      const { count } = await supabase
        .from("temporary_leaves")
        .select("*", { count: "exact", head: true })
        .eq("student_id", student.id)
        .or(
          `and(year.lt.${currentYear}),and(year.eq.${currentYear},month.lte.${currentMonth})`
        )

      if ((count ?? 0) > 3) {
        overdue.push(student as Student)
      }
    }

    return overdue
  },
}
