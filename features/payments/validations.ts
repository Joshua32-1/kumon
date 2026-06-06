import { z } from "zod"

const generateInvoiceCategorySchema = z.enum([
  "no_invoice",
  "PENDING",
  "PAID",
  "OVERDUE",
  "CANCELLED",
  "WAIVED",
  "PAID_OLD_LINK",
])

export const generateMonthlySchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  categories: z.array(generateInvoiceCategorySchema).optional(),
  student_ids: z.array(z.string().uuid()).optional(),
})

export const generateCandidatesSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
})

export const updateInvoiceSchema = z.object({
  status: z.enum(["PENDING", "PAID", "OVERDUE", "CANCELLED", "WAIVED"]).optional(),
  notes: z.string().optional(),
})
