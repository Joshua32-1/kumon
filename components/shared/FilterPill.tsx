import { cn } from "@/lib/utils"

interface FilterPillProps {
  label: string
  active?: boolean
  variant?: "default" | "attention" | "danger"
  onClick?: () => void
  className?: string
}

export function FilterPill({
  label,
  active = false,
  variant = "default",
  onClick,
  className,
}: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3.5 py-1.5 text-sm transition-all duration-200",
        active && variant === "default" && "border-primary bg-primary text-primary-foreground shadow-sm",
        active && variant === "attention" && "border-[var(--danger)] bg-[var(--danger)] text-white shadow-sm",
        active && variant === "danger" && "border-[var(--danger)] bg-[var(--danger)] text-white shadow-sm",
        !active && "border-border bg-card text-foreground hover:bg-muted",
        className
      )}
    >
      {label}
    </button>
  )
}
