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
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"

type FormValues = z.infer<typeof createStudentSchema>

const RELATIONSHIPS = ["Ayah", "Ibu", "Wali"]

export function StudentForm() {
  const router = useRouter()
  const form = useForm<FormValues>({
    resolver: zodResolver(createStudentSchema),
    defaultValues: {
      full_name: "",
      grade: "",
      notes: "",
      contact: { full_name: "", relationship: "Ibu", whatsapp_number: "" },
    },
  })

  async function onSubmit(values: FormValues) {
    const result = await createStudentAction(values)
    if ("error" in result && result.error) {
      toast.error("Gagal menyimpan siswa.")
      return
    }
    toast.success("Siswa berhasil ditambahkan.")
    router.push("/students")
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-xl">
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Data Siswa
          </h2>
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
                <FormControl>
                  <Input placeholder="SD 3, SMP 1, dll." {...field} />
                </FormControl>
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

        <Separator />

        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Kontak Utama (Orang Tua/Wali)
          </h2>
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

        <div className="flex gap-3">
          <Button type="submit" disabled={form.formState.isSubmitting}>
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
