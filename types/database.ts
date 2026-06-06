// Hand-maintained to match supabase/migrations/0001–0004.
// Includes hand-authored enums, RPC return shapes, and fields not emitted by supabase gen types.
// Regenerate baseline with: npx supabase gen types typescript --project-id <id> > types/database.ts
// Then re-apply manual additions (StudentGrade, PAID_OLD_LINK, promote_grades_annual, etc.).

export type StudentStatus = "ACTIVE" | "TEMPORARY_LEAVE" | "INACTIVE"
export type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED"
  | "WAIVED"
  | "PAID_OLD_LINK"
export type StudentGrade =
  | "TK_1"
  | "TK_2"
  | "SD_1"
  | "SD_2"
  | "SD_3"
  | "SD_4"
  | "SD_5"
  | "SD_6"
  | "SMP_1"
  | "SMP_2"
  | "SMP_3"
  | "SMA_1"
  | "SMA_2"
  | "SMA_3"
export type ReminderStatus = "PENDING" | "SENT" | "FAILED"
export type KumonSubject = "ENGLISH" | "INDONESIAN" | "MATHEMATICS"
export type SchoolLevel = "ELEMENTARY" | "SECONDARY"

export interface Database {
  public: {
    Tables: {
      students: {
        Row: {
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
        Insert: {
          id?: string
          full_name: string
          grade: StudentGrade
          school_level?: SchoolLevel
          status?: StudentStatus
          enrolled_at?: string
          deactivated_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          grade?: StudentGrade
          school_level?: SchoolLevel
          status?: StudentStatus
          enrolled_at?: string
          deactivated_at?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      student_subjects: {
        Row: {
          id: string
          student_id: string
          subject: KumonSubject
          enrolled_at: string
          created_at: string
        }
        Insert: {
          id?: string
          student_id: string
          subject: KumonSubject
          enrolled_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          student_id?: string
          subject?: KumonSubject
          enrolled_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_subjects_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          }
        ]
      }
      contacts: {
        Row: {
          id: string
          student_id: string
          full_name: string
          relationship: string
          whatsapp_number: string
          is_primary: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          student_id: string
          full_name: string
          relationship: string
          whatsapp_number: string
          is_primary?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          student_id?: string
          full_name?: string
          relationship?: string
          whatsapp_number?: string
          is_primary?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          }
        ]
      }
      temporary_leaves: {
        Row: {
          id: string
          student_id: string
          month: number
          year: number
          reason: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          student_id: string
          month: number
          year: number
          reason?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          student_id?: string
          month?: number
          year?: number
          reason?: string | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "temporary_leaves_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          }
        ]
      }
      invoices: {
        Row: {
          id: string
          student_id: string
          month: number
          year: number
          amount: number
          status: PaymentStatus
          due_date: string
          paid_at: string | null
          midtrans_order_id: string | null
          midtrans_payment_url: string | null
          midtrans_transaction_id: string | null
          midtrans_order_ids: string[]
          school_level_at_billing: SchoolLevel
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          student_id: string
          month: number
          year: number
          amount: number
          status?: PaymentStatus
          due_date: string
          paid_at?: string | null
          midtrans_order_id?: string | null
          midtrans_payment_url?: string | null
          midtrans_transaction_id?: string | null
          midtrans_order_ids?: string[]
          school_level_at_billing: SchoolLevel
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          student_id?: string
          month?: number
          year?: number
          amount?: number
          status?: PaymentStatus
          due_date?: string
          paid_at?: string | null
          midtrans_order_id?: string | null
          midtrans_payment_url?: string | null
          midtrans_transaction_id?: string | null
          midtrans_order_ids?: string[]
          school_level_at_billing?: SchoolLevel
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          }
        ]
      }
      invoice_line_items: {
        Row: {
          id: string
          invoice_id: string
          subject: KumonSubject
          label: string
          unit_amount: number
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          subject: KumonSubject
          label: string
          unit_amount: number
          created_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          subject?: KumonSubject
          label?: string
          unit_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          }
        ]
      }
      payment_reminders: {
        Row: {
          id: string
          invoice_id: string
          student_id: string
          reminder_number: number
          scheduled_date: string
          sent_at: string | null
          status: ReminderStatus
          whatsapp_number: string
          message_preview: string | null
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          student_id: string
          reminder_number: number
          scheduled_date: string
          sent_at?: string | null
          status?: ReminderStatus
          whatsapp_number: string
          message_preview?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          student_id?: string
          reminder_number?: number
          scheduled_date?: string
          sent_at?: string | null
          status?: ReminderStatus
          whatsapp_number?: string
          message_preview?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          }
        ]
      }
      system_config: {
        Row: {
          key: string
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          value: Record<string, any>
          updated_at: string
        }
        Insert: {
          key: string
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          value: Record<string, any>
          updated_at?: string
        }
        Update: {
          key?: string
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          value?: Record<string, any>
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      promote_grades_annual: {
        Args: { p_promotion_year: number }
        Returns: {
          promotion_year: number
          already_promoted: boolean
          promoted: number
          unchanged: number
          skipped_inactive: number
        }
      }
    }
    CompositeTypes: Record<string, never>
    Enums: {
      student_status: StudentStatus
      payment_status: PaymentStatus
      reminder_status: ReminderStatus
      kumon_subject: KumonSubject
      school_level: SchoolLevel
      student_grade: StudentGrade
    }
  }
}
