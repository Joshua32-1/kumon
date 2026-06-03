import Link from "next/link"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { LogoutButton } from "./LogoutButton"

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/students", label: "Siswa" },
  { href: "/payments", label: "Pembayaran" },
  { href: "/settings", label: "Pengaturan" },
]

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
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r bg-muted/20 px-3 py-5">
        <div className="mb-6 px-2">
          <span className="text-base font-semibold tracking-tight">Kumon Admin</span>
        </div>
        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted hover:text-foreground text-muted-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <LogoutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl space-y-6 p-6">{children}</div>
      </main>
    </div>
  )
}
