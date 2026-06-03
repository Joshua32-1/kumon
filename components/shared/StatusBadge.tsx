import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const statusConfig: Record<string, { label: string; className: string }> = {
  // Student status
  ACTIVE: { label: "Aktif", className: "bg-green-100 text-green-800 border-green-200" },
  TEMPORARY_LEAVE: {
    label: "Cuti",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200",
  },
  INACTIVE: { label: "Tidak Aktif", className: "bg-gray-100 text-gray-600 border-gray-200" },
  // Payment status
  PENDING: {
    label: "Belum Bayar",
    className: "bg-orange-100 text-orange-800 border-orange-200",
  },
  PAID: { label: "Lunas", className: "bg-green-100 text-green-800 border-green-200" },
  OVERDUE: { label: "Terlambat", className: "bg-red-100 text-red-800 border-red-200" },
  CANCELLED: {
    label: "Dibatalkan",
    className: "bg-gray-100 text-gray-600 border-gray-200",
  },
  WAIVED: {
    label: "Dibebaskan",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  // Reminder status
  SENT: { label: "Terkirim", className: "bg-green-100 text-green-800 border-green-200" },
  FAILED: { label: "Gagal", className: "bg-red-100 text-red-800 border-red-200" },
}

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, className: "" }
  return (
    <Badge
      variant="outline"
      className={cn(config.className, "font-medium", className)}
    >
      {config.label}
    </Badge>
  )
}
