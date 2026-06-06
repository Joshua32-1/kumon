import type { Metadata } from "next"
import { Inter, Playfair_Display } from "next/font/google"
import { Toaster } from "sonner"
import "./globals.css"

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
})

const playfair = Playfair_Display({
  variable: "--font-heading",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Kumon Admin",
  description: "Panel manajemen Kumon Center",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id" className={`${inter.variable} ${playfair.variable} h-full`}>
      <body className="min-h-full bg-background text-foreground">
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            classNames: {
              toast:
                "bg-card text-card-foreground border-border shadow-card font-sans",
              title: "font-medium text-foreground",
              description: "text-muted-foreground",
              success: "border-[var(--success-border)] bg-[var(--success-muted)]",
              error: "border-[var(--danger-border)] bg-[var(--danger-muted)]",
              warning: "border-[var(--warning-border)] bg-[var(--warning-muted)]",
              info: "border-[var(--info-border)] bg-[var(--info-muted)]",
            },
          }}
        />
      </body>
    </html>
  )
}
