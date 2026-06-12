"use server"

import { revalidatePath } from "next/cache"
import { studentService } from "./service"
import {
  createStudentSchema,
  updateStudentSchema,
  updateEnrollmentSchema,
  updateContactSchema,
  setLeaveSchema,
  setLeaveBulkSchema,
} from "./validations"
import type {
  CreateStudentInput,
  UpdateStudentInput,
  UpdateEnrollmentInput,
  UpdateContactInput,
  SetLeaveBulkInput,
} from "./types"

export async function createStudentAction(input: CreateStudentInput) {
  const parsed = createStudentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  const student = await studentService.create(parsed.data as CreateStudentInput)
  revalidatePath("/students")
  return { data: student }
}

export async function updateStudentAction(id: string, input: UpdateStudentInput) {
  const parsed = updateStudentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  const student = await studentService.update(id, parsed.data)
  revalidatePath("/students")
  revalidatePath(`/students/${id}`)
  return { data: student }
}

export async function updateEnrollmentAction(id: string, input: UpdateEnrollmentInput) {
  const parsed = updateEnrollmentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  await studentService.updateEnrollment(id, parsed.data)
  revalidatePath("/students")
  revalidatePath(`/students/${id}`)
  return { data: true }
}

export async function updateContactAction(id: string, input: UpdateContactInput) {
  const parsed = updateContactSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  const contact = await studentService.updatePrimaryContact(id, parsed.data)
  revalidatePath("/students")
  revalidatePath(`/students/${id}`)
  return { data: contact }
}

export async function deactivateStudentAction(id: string) {
  await studentService.deactivate(id)
  revalidatePath("/students")
  revalidatePath(`/students/${id}`)
  return { data: true }
}

export async function reactivateStudentAction(id: string) {
  await studentService.reactivate(id)
  revalidatePath("/students")
  revalidatePath(`/students/${id}`)
  return { data: true }
}

export async function setLeaveAction(
  studentId: string,
  month: number,
  year: number,
  reason?: string
) {
  const parsed = setLeaveSchema.safeParse({ month, year, reason })
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  const leave = await studentService.setLeave(studentId, month, year, reason)
  revalidatePath(`/students/${studentId}`)
  return { data: leave }
}

export async function setLeaveBulkAction(input: SetLeaveBulkInput) {
  const parsed = setLeaveBulkSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  const result = await studentService.setLeaveBulk(
    parsed.data.student_ids,
    parsed.data.month,
    parsed.data.year,
    parsed.data.reason
  )
  revalidatePath("/students")
  for (const studentId of parsed.data.student_ids) {
    revalidatePath(`/students/${studentId}`)
  }
  return { data: result }
}

export async function cancelLeaveAction(leaveId: string, studentId: string) {
  await studentService.cancelLeave(leaveId)
  revalidatePath(`/students/${studentId}`)
  return { data: true }
}
