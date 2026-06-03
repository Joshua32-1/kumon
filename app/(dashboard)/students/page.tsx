import Link from "next/link"
import { studentService } from "@/features/students/service"
import { StudentTable } from "@/features/students/components/StudentTable"
import { PageHeader } from "@/components/shared/PageHeader"
import { Button } from "@/components/ui/button"
import type { StudentStatus } from "@/features/students/types"

interface PageProps {
  searchParams: Promise<{ status?: string; search?: string }>
}

export default async function StudentsPage({ searchParams }: PageProps) {
  const { status, search } = await searchParams
  const students = await studentService.list({
    status: status as StudentStatus | undefined,
    search,
  })

  return (
    <>
      <PageHeader
        title="Siswa"
        description={`${students.length} siswa ditemukan`}
        action={
          <Link href="/students/new">
            <Button>+ Tambah Siswa</Button>
          </Link>
        }
      />

      {/* Filter bar */}
      <div className="flex gap-2">
        {[
          { label: "Semua", value: "" },
          { label: "Aktif", value: "ACTIVE" },
          { label: "Cuti", value: "TEMPORARY_LEAVE" },
          { label: "Tidak Aktif", value: "INACTIVE" },
        ].map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/students?status=${f.value}` : "/students"}
            className={`rounded-md border px-3 py-1 text-sm transition-colors ${
              (status ?? "") === f.value
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-muted"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <StudentTable students={students} />
    </>
  )
}
