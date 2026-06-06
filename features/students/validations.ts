import { z } from "zod"
import { ALL_SUBJECTS } from "@/lib/billing/fees"
import { ALL_GRADES } from "@/lib/billing/grades"
import { monthYearFromDateString, toDateString } from "@/lib/utils"

export const phoneRegex = /^\+62\d{8,13}$/

const gradeSchema = z.enum(ALL_GRADES)

export const contactSchema = z.object({
  full_name: z.string().min(2, "Nama minimal 2 karakter"),
  relationship: z.string().min(1, "Pilih hubungan"),
  whatsapp_number: z
    .string()
    .regex(phoneRegex, "Format nomor: +628xxxxxxxx"),
})

export const createStudentSchema = z.object({
  full_name: z.string().min(2, "Nama minimal 2 karakter"),
  grade: gradeSchema,
  subjects: z
    .array(z.enum(["ENGLISH", "INDONESIAN", "MATHEMATICS"]))
    .min(1, "Pilih minimal 1 mata pelajaran")
    .refine((arr) => arr.every((s) => ALL_SUBJECTS.includes(s)), "Mata pelajaran tidak valid"),
  enrolled_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format bulan/tahun tidak valid")
    .transform((s) => {
      const { month, year } = monthYearFromDateString(s)
      return toDateString(year, month, 1)
    }),
  notes: z.string().optional(),
  contact: contactSchema,
})

export const updateStudentSchema = z.object({
  full_name: z.string().min(2, "Nama minimal 2 karakter").optional(),
  grade: gradeSchema.optional(),
  notes: z.string().optional(),
})

export const updateContactSchema = contactSchema

export const updateEnrollmentSchema = z.object({
  subjects: z
    .array(z.enum(["ENGLISH", "INDONESIAN", "MATHEMATICS"]))
    .min(1, "Pilih minimal 1 mata pelajaran")
    .optional(),
})

export const setLeaveSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  reason: z.string().optional(),
})
