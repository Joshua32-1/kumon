import type { KumonSubject, SchoolLevel } from "@/lib/billing/fees"
import type { StudentGrade } from "@/lib/billing/grades"

export type { KumonSubject, SchoolLevel, StudentGrade }
export type StudentStatus = "ACTIVE" | "TEMPORARY_LEAVE" | "INACTIVE"

export interface Student {
  id: string
  full_name: string
  grade: StudentGrade
  school_level: SchoolLevel
  status: StudentStatus
  enrolled_at: string
  deactivated_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface StudentSubject {
  id: string
  student_id: string
  subject: KumonSubject
  enrolled_at: string
  created_at: string
}

export interface Contact {
  id: string
  student_id: string
  full_name: string
  relationship: string
  whatsapp_number: string
  is_primary: boolean
  created_at: string
  updated_at: string
}

export interface TemporaryLeave {
  id: string
  student_id: string
  month: number
  year: number
  reason: string | null
  created_at: string
}

/** Shown when consecutive leave months reach the configured limit (admin should review). */
export interface LeaveReviewAlert {
  consecutive_months: number
  max_consecutive_months: number
  period_start_month: number
  period_start_year: number
  period_end_month: number
  period_end_year: number
}

export interface LeaveReviewStudent {
  id: string
  full_name: string
  status: StudentStatus
  consecutive_months: number
  max_consecutive_months: number
  period_start_month: number
  period_start_year: number
  period_end_month: number
  period_end_year: number
}

export interface StudentDetail extends Student {
  contacts: Contact[]
  active_leaves: TemporaryLeave[]
  subjects: StudentSubject[]
  leave_review: LeaveReviewAlert | null
}

export interface LeaveReviewListResult {
  max_consecutive_months: number
  students: LeaveReviewStudent[]
}

export interface CreateStudentInput {
  full_name: string
  grade: StudentGrade
  subjects: KumonSubject[]
  enrolled_at?: string
  notes?: string
  contact: {
    full_name: string
    relationship: string
    whatsapp_number: string
  }
}

export interface UpdateStudentInput {
  full_name?: string
  grade?: StudentGrade
  notes?: string
}

export interface UpdateEnrollmentInput {
  subjects?: KumonSubject[]
}

export interface UpdateContactInput {
  full_name: string
  relationship: string
  whatsapp_number: string
}

export interface StudentFilters {
  status?: StudentStatus
  search?: string
}

export interface SetLeaveInput {
  month: number
  year: number
  reason?: string
}

export interface SetLeaveBulkInput {
  student_ids: string[]
  month: number
  year: number
  reason?: string
  cancel_unpaid_invoices?: boolean
}

export interface BulkLeaveUnpaidInvoice {
  invoice_id: string
  student_id: string
  student_name: string
  amount: number
  status: "PENDING" | "OVERDUE" | "PAID"
}

export interface SetLeaveBulkResult {
  created: number
  skipped_existing: number
  skipped_ineligible: number
  /** Still PENDING/OVERDUE after the action (cancel declined or failed). */
  unpaid_invoices: BulkLeaveUnpaidInvoice[]
  /** Cancelled by the action because the admin opted in. */
  cancelled_invoices: BulkLeaveUnpaidInvoice[]
  /** Already PAID before cuti — refund/credit is a manual decision (see Dashboard). */
  paid_invoices: BulkLeaveUnpaidInvoice[]
}

export interface PromoteGradesResult {
  promotion_year: number
  already_promoted: boolean
  promoted: number
  unchanged: number
  skipped_inactive: number
}
