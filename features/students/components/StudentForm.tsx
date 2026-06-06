"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createStudentSchema } from "../validations"
import { createStudentAction } from "../actions"
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { ALL_SUBJECTS, SUBJECT_LABELS, SCHOOL_LEVEL_LABELS } from "@/lib/billing/fees"
import { ALL_GRADES, GRADE_LABELS, gradeToSchoolLevel } from "@/lib/billing/grades"
import {
  currentMonthYearInCenterTimezone,
  getMonthName,
  monthYearFromDateString,
  toDateString,
} from "@/lib/utils"
import type { KumonSubject } from "@/lib/billing/fees"
import type { StudentGrade } from "@/lib/billing/grades"

type FormValues = z.infer<typeof createStudentSchema>

const RELATIONSHIPS = ["Ayah", "Ibu", "Wali"]

function nextBillingMonthLabel(): string {
  const { month, year } = currentMonthYearInCenterTimezone()
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  return `${getMonthName(nextMonth)} ${nextYear}`
}

function defaultEnrolledAt(): string {
  const { month, year } = currentMonthYearInCenterTimezone()
  return toDateString(year, month, 1)
}

export function StudentForm() {
  const router = useRouter()
  const { year: currentYear } = currentMonthYearInCenterTimezone()
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)
  const form = useForm<FormValues>({
    resolver: zodResolver(createStudentSchema),
    defaultValues: {
      full_name: "",
      grade: "SD_1",
      subjects: [],
      enrolled_at: defaultEnrolledAt(),
      notes: "",
      contact: { full_name: "", relationship: "Ibu", whatsapp_number: "" },
    },
  })

  const selectedGrade = form.watch("grade") as StudentGrade | undefined
  const tierLabel = selectedGrade
    ? SCHOOL_LEVEL_LABELS[gradeToSchoolLevel(selectedGrade)]
    : "—"

  async function onSubmit(values: FormValues) {
    const result = await createStudentAction(values)
    if ("error" in result && result.error) {
      toast.error("Gagal menyimpan siswa.")
      return
    }
    toast.success("Siswa berhasil ditambahkan.")
    router.push("/students")
  }

  const selectedSubjects = form.watch("subjects") ?? []

  function toggleSubject(subject: KumonSubject) {
    const current = form.getValues("subjects") ?? []
    if (current.includes(subject)) {
      form.setValue("subjects", current.filter((s) => s !== subject), { shouldValidate: true })
    } else {
      form.setValue("subjects", [...current, subject], { shouldValidate: true })
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-xl space-y-8">
        <div className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-card">
          <div>
            <h2 className="font-heading text-lg font-medium tracking-tight">
              Data Siswa
            </h2>
            <div className="mt-2 h-px w-8 bg-[var(--highlight)]" />
          </div>
          <FormField
            control={form.control}
            name="full_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nama Lengkap</FormLabel>
                <FormControl>
                  <Input placeholder="Nama siswa" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="grade"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Kelas</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih kelas" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ALL_GRADES.map((grade) => (
                      <SelectItem key={grade} value={grade}>
                        {GRADE_LABELS[grade]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  Tingkat tagihan: {tierLabel}
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="enrolled_at"
            render={({ field }) => {
              const { month, year } = monthYearFromDateString(field.value)
              return (
                <FormItem>
                  <FormLabel>Bulan Terdaftar</FormLabel>
                  <div className="flex gap-3">
                    <Select
                      value={String(month)}
                      onValueChange={(v) =>
                        field.onChange(toDateString(year, Number(v), 1))
                      }
                    >
                      <FormControl>
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <SelectItem key={m} value={String(m)}>
                            {getMonthName(m)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={String(year)}
                      onValueChange={(v) =>
                        field.onChange(toDateString(Number(v), month, 1))
                      }
                    >
                      <FormControl>
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {yearOptions.map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Tagihan bulanan dimulai dari bulan terdaftar. Siswa tidak ditagih
                    untuk bulan sebelum bulan ini.
                  </p>
                  <div className="rounded-lg border border-[var(--info-border)] bg-[var(--info-muted)] px-3 py-2.5 text-xs text-[var(--info)]">
                    <p>
                      Jika siswa baru mulai ditagih bulan depan ({nextBillingMonthLabel()}),
                      pilih {nextBillingMonthLabel()} sebagai bulan terdaftar.
                    </p>
                  </div>
                  <FormMessage />
                </FormItem>
              )
            }}
          />
          <FormField
            control={form.control}
            name="subjects"
            render={() => (
              <FormItem>
                <FormLabel>Mata Pelajaran</FormLabel>
                <div className="flex flex-wrap gap-4 pt-1">
                  {ALL_SUBJECTS.map((subject) => (
                    <label
                      key={subject}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={selectedSubjects.includes(subject)}
                        onCheckedChange={() => toggleSubject(subject)}
                      />
                      {SUBJECT_LABELS[subject]}
                    </label>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Catatan</FormLabel>
                <FormControl>
                  <Textarea placeholder="Catatan tambahan..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-card">
          <div>
            <h2 className="font-heading text-lg font-medium tracking-tight">
              Kontak Utama (Orang Tua/Wali)
            </h2>
            <div className="mt-2 h-px w-8 bg-[var(--highlight)]" />
          </div>
          <FormField
            control={form.control}
            name="contact.full_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nama Orang Tua/Wali</FormLabel>
                <FormControl>
                  <Input placeholder="Nama orang tua" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contact.relationship"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Hubungan</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih hubungan" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {RELATIONSHIPS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contact.whatsapp_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nomor WhatsApp</FormLabel>
                <FormControl>
                  <Input placeholder="+628xxxxxxxx" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={form.formState.isSubmitting} className="h-10">
            {form.formState.isSubmitting ? "Menyimpan..." : "Simpan Siswa"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/students")}
          >
            Batal
          </Button>
        </div>
      </form>
    </Form>
  )
}
