import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const statusConfig: Record<string, { label: string; className: string }> = {
  // Student status
  ACTIVE: {
    label: "Aktif",
    className: "bg-[var(--success-muted)] text-[var(--success)] border-[var(--success-border)]",
  },
  TEMPORARY_LEAVE: {
    label: "Cuti",
    className: "bg-[var(--warning-muted)] text-[var(--warning)] border-[var(--warning-border)]",
  },
  INACTIVE: {
    label: "Tidak Aktif",
    className: "bg-[var(--neutral-muted)] text-muted-foreground border-[var(--neutral-border)]",
  },
  // Payment status
  no_invoice: {
    label: "Belum ada tagihan",
    className: "bg-[var(--neutral-muted)] text-muted-foreground border-[var(--neutral-border)]",
  },
  PENDING: {
    label: "Belum Bayar",
    className: "bg-[var(--warning-muted)] text-[var(--warning-foreground)] border-[var(--warning-border)]",
  },
  PAID: {
    label: "Lunas",
    className: "bg-[var(--success-muted)] text-[var(--success)] border-[var(--success-border)]",
  },
  OVERDUE: {
    label: "Terlambat",
    className: "bg-[var(--danger-muted)] text-[var(--danger)] border-[var(--danger-border)]",
  },
  CANCELLED: {
    label: "Dibatalkan",
    className: "bg-[var(--neutral-muted)] text-muted-foreground border-[var(--neutral-border)]",
  },
  WAIVED: {
    label: "Dibebaskan",
    className: "bg-[var(--info-muted)] text-[var(--info)] border-[var(--info-border)]",
  },
  PAID_OLD_LINK: {
    label: "Lunas (link lama)",
    className: "bg-[var(--highlight-muted)] text-[var(--highlight)] border-[var(--highlight-border)]",
  },
  // Reminder status
  SENT: {
    label: "Terkirim",
    className: "bg-[var(--success-muted)] text-[var(--success)] border-[var(--success-border)]",
  },
  FAILED: {
    label: "Gagal",
    className: "bg-[var(--danger-muted)] text-[var(--danger)] border-[var(--danger-border)]",
  },
  // WhatsApp delivery status
  not_applicable: {
    label: "—",
    className: "bg-[var(--neutral-muted)] text-muted-foreground/60 border-[var(--neutral-border)]",
  },
  no_link: {
    label: "Belum ada link",
    className: "bg-[var(--warning-muted)] text-[var(--warning-foreground)] border-[var(--warning-border)]",
  },
  link_not_sent: {
    label: "Belum dikirim",
    className: "bg-[var(--warning-muted)] text-[var(--warning)] border-[var(--warning-border)]",
  },
  sent: {
    label: "Terkirim",
    className: "bg-[var(--success-muted)] text-[var(--success)] border-[var(--success-border)]",
  },
  send_failed: {
    label: "Gagal dikirim",
    className: "bg-[var(--danger-muted)] text-[var(--danger)] border-[var(--danger-border)]",
  },
  partial_failed: {
    label: "Sebagian gagal",
    className: "bg-[var(--warning-muted)] text-[var(--warning-foreground)] border-[var(--warning-border)]",
  },
  // WhatsApp delivery confirmation (Meta callbacks)
  awaiting: {
    label: "Menunggu konfirmasi",
    className: "bg-[var(--neutral-muted)] text-muted-foreground border-[var(--neutral-border)]",
  },
  delivered: {
    label: "Tersampaikan",
    className: "bg-[var(--success-muted)] text-[var(--success)] border-[var(--success-border)]",
  },
  read: {
    label: "Dibaca",
    className: "bg-[var(--info-muted)] text-[var(--info)] border-[var(--info-border)]",
  },
  failed: {
    label: "Gagal terkirim",
    className: "bg-[var(--danger-muted)] text-[var(--danger)] border-[var(--danger-border)]",
  },
  // Attention
  needs_action: {
    label: "Perlu tindakan",
    className: "bg-[var(--danger-muted)] text-[var(--danger)] border-[var(--danger-border)]",
  },
  attention_delivery: {
    label: "Perlu tindakan (WA)",
    className: "bg-[var(--warning-muted)] text-[var(--warning-foreground)] border-[var(--warning-border)]",
  },
  attention_collection: {
    label: "Tunggakan",
    className: "bg-[var(--danger-muted)] text-[var(--danger)] border-[var(--danger-border)]",
  },
  on_leave: {
    label: "Cuti",
    className: "bg-[var(--warning-muted)] text-[var(--warning)] border-[var(--warning-border)]",
  },
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
