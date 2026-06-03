"use client"

import { use, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { PageHeader } from "@/components/shared/PageHeader"
import { StudentStatusBadge } from "@/features/students/components/StudentStatusBadge"
import { LeaveDialog } from "@/features/students/components/LeaveDialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDate, getMonthName } from "@/lib/utils"
import { deactivateStudentAction, cancelLeaveAction } from "@/features/students/actions"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((r) => r.json()).then((r) => r.data)

interface PageProps {
  params: Promise<{ id: string }>
}

export default function StudentDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { data: student, isLoading, mutate } = useSWR(`/api/students/${id}`, fetcher)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)

  async function handleDeactivate() {
    setIsDeactivating(true)
    await deactivateStudentAction(id)
    toast.success("Siswa dinonaktifkan.")
    setIsDeactivating(false)
    setDeactivateOpen(false)
    router.push("/students")
  }

  async function handleCancelLeave(leaveId: string) {
    await cancelLeaveAction(leaveId, id)
    toast.success("Cuti dibatalkan.")
    mutate()
  }

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center text-sm">Memuat...</div>
  }

  if (!student) {
    return <div className="text-muted-foreground py-12 text-center text-sm">Siswa tidak ditemukan.</div>
  }

  return (
    <>
      <PageHeader
        title={student.full_name}
        description={`Kelas: ${student.grade ?? "—"} · Terdaftar: ${formatDate(student.enrolled_at)}`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setLeaveOpen(true)}>
              Atur Cuti
            </Button>
            {student.status !== "INACTIVE" && (
              <Button variant="destructive" onClick={() => setDeactivateOpen(true)}>
                Nonaktifkan
              </Button>
            )}
          </div>
        }
      />

      <div className="flex items-center gap-3">
        <StudentStatusBadge status={student.status} />
        {student.notes && (
          <span className="text-muted-foreground text-sm">{student.notes}</span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Contacts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kontak</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {student.contacts?.length === 0 && (
              <p className="text-muted-foreground text-sm">Belum ada kontak.</p>
            )}
            {student.contacts?.map((contact: { id: string; full_name: string; relationship: string; whatsapp_number: string; is_primary: boolean }) => (
              <div key={contact.id} className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{contact.full_name}</p>
                  <p className="text-muted-foreground text-xs">{contact.relationship} · {contact.whatsapp_number}</p>
                </div>
                {contact.is_primary && (
                  <Badge variant="outline" className="text-xs">Utama</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Leaves */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Riwayat Cuti</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {student.active_leaves?.length === 0 && (
              <p className="text-muted-foreground text-sm">Tidak ada cuti.</p>
            )}
            {student.active_leaves?.map((leave: { id: string; month: number; year: number; reason: string | null }) => (
              <div key={leave.id} className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {getMonthName(leave.month)} {leave.year}
                  </p>
                  {leave.reason && (
                    <p className="text-muted-foreground text-xs">{leave.reason}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive text-xs"
                  onClick={() => handleCancelLeave(leave.id)}
                >
                  Batalkan
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <LeaveDialog
        studentId={id}
        open={leaveOpen}
        onOpenChange={(o) => { setLeaveOpen(o); if (!o) mutate() }}
      />
      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title="Nonaktifkan Siswa"
        description={`Yakin ingin menonaktifkan ${student.full_name}? Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Nonaktifkan"
        variant="destructive"
        onConfirm={handleDeactivate}
        isLoading={isDeactivating}
      />
    </>
  )
}
