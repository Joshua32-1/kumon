// Hand-authored to match supabase/migrations/0001_initial_schema.sql
// Regenerate with: npx supabase gen types typescript --project-id <id> > types/database.ts

export type StudentStatus = "ACTIVE" | "TEMPORARY_LEAVE" | "INACTIVE"
export type PaymentStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED" | "WAIVED"
export type ReminderStatus = "PENDING" | "SENT" | "FAILED"

export interface Database {
  public: {
    Tables: {
      students: {
        Row: {
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
        Insert: {
          id?: string
          full_name: string
          grade?: string | null
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
          grade?: string | null
          status?: StudentStatus
          enrolled_at?: string
          deactivated_at?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
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
    Functions: Record<string, never>
    CompositeTypes: Record<string, never>
    Enums: {
      student_status: StudentStatus
      payment_status: PaymentStatus
      reminder_status: ReminderStatus
    }
  }
}
