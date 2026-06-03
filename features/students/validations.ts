import { z } from "zod"

export const phoneRegex = /^\+62\d{8,13}$/

export const contactSchema = z.object({
  full_name: z.string().min(2, "Nama minimal 2 karakter"),
  relationship: z.string().min(1, "Pilih hubungan"),
  whatsapp_number: z
    .string()
    .regex(phoneRegex, "Format nomor: +628xxxxxxxx"),
})

export const createStudentSchema = z.object({
  full_name: z.string().min(2, "Nama minimal 2 karakter"),
  grade: z.string().optional(),
  enrolled_at: z.string().optional(),
  notes: z.string().optional(),
  contact: contactSchema,
})

export const updateStudentSchema = z.object({
  full_name: z.string().min(2, "Nama minimal 2 karakter").optional(),
  grade: z.string().optional(),
  notes: z.string().optional(),
})

export const setLeaveSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  reason: z.string().optional(),
})
