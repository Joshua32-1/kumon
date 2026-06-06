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
  PAID_OLD_LINK: {
    label: "Lunas (link lama)",
    className: "bg-purple-100 text-purple-800 border-purple-200",
  },
  // Reminder status
  SENT: { label: "Terkirim", className: "bg-green-100 text-green-800 border-green-200" },
  FAILED: { label: "Gagal", className: "bg-red-100 text-red-800 border-red-200" },
  // WhatsApp delivery status (from billing-summary)
  not_applicable: { label: "—", className: "bg-gray-50 text-gray-400 border-gray-100" },
  no_link: { label: "Belum ada link", className: "bg-orange-100 text-orange-800 border-orange-200" },
  link_not_sent: { label: "Belum dikirim", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  sent: { label: "Terkirim", className: "bg-green-100 text-green-800 border-green-200" },
  send_failed: { label: "Gagal dikirim", className: "bg-red-100 text-red-800 border-red-200" },
  partial_failed: { label: "Sebagian gagal", className: "bg-orange-100 text-orange-800 border-orange-200" },
  // Attention
  needs_action: { label: "Perlu tindakan", className: "bg-red-100 text-red-700 border-red-200" },
  attention_delivery: { label: "Perlu tindakan (WA)", className: "bg-orange-100 text-orange-700 border-orange-200" },
  attention_collection: { label: "Tunggakan", className: "bg-red-100 text-red-700 border-red-200" },
  on_leave: { label: "Cuti", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
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
