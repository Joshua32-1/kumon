import { createSupabaseServerClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/shared/PageHeader"
import { SettingsForm } from "./SettingsForm"

async function getSystemConfig() {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("system_config")
    .select("*")
    .returns<{ key: string; value: Record<string, unknown> }[]>()

  const config: Record<string, unknown> = {}
  for (const row of data ?? []) {
    config[row.key] = row.value
  }
  return config
}

export default async function SettingsPage() {
  const config = await getSystemConfig()

  return (
    <>
      <PageHeader
        title="Pengaturan"
        description="Konfigurasi sistem dan operasional center."
      />
      <SettingsForm initialConfig={config} />
    </>
  )
}
