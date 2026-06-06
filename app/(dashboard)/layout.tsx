import { AppSidebar } from "@/components/shared/AppSidebar"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-auto md:ml-60">
        <div className="mx-auto max-w-7xl space-y-8 p-4 pt-20 md:p-8 md:pt-8">
          {children}
        </div>
      </main>
    </div>
  )
}
