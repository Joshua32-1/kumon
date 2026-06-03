export type StudentStatus = "ACTIVE" | "TEMPORARY_LEAVE" | "INACTIVE"

export interface Student {
  id: string
  full_name: string
  grade: string | null
  status: StudentStatus
  enrolled_at: string
  deactivated_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
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

export interface StudentDetail extends Student {
  contacts: Contact[]
  active_leaves: TemporaryLeave[]
}

export interface CreateStudentInput {
  full_name: string
  grade?: string
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
  grade?: string
  notes?: string
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
