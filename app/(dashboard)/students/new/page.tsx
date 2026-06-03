import { PageHeader } from "@/components/shared/PageHeader"
import { StudentForm } from "@/features/students/components/StudentForm"

export default function NewStudentPage() {
  return (
    <>
      <PageHeader title="Tambah Siswa Baru" description="Isi data siswa dan kontak utama." />
      <StudentForm />
    </>
  )
}
