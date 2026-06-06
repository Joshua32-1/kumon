import { z } from "zod"

export const generateMonthlySchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
})

export const updateInvoiceSchema = z.object({
  status: z.enum(["PENDING", "PAID", "OVERDUE", "CANCELLED", "WAIVED"]).optional(),
  notes: z.string().optional(),
})
