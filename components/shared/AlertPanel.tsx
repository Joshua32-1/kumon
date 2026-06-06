import Link from "next/link"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface AlertPanelItem {
  key: string
  href: string
  primary: string
  secondary: string
}

interface AlertPanelProps {
  variant: "warning" | "danger"
  title: string
  description?: React.ReactNode
  items: AlertPanelItem[]
  footer?: React.ReactNode
  className?: string
}

const variantStyles = {
  warning: {
    card: "border-[var(--warning-border)] bg-[var(--warning-muted)]",
    title: "text-[var(--warning-foreground)]",
    description: "text-[var(--warning-foreground)]/80",
    list: "divide-[var(--warning-border)] border-[var(--warning-border)] bg-card",
    itemHover: "hover:bg-[var(--warning-muted)]/60",
    primary: "text-[var(--warning-foreground)]",
    secondary: "text-[var(--warning)]",
  },
  danger: {
    card: "border-[var(--danger-border)] bg-[var(--danger-muted)]",
    title: "text-[var(--danger-foreground)]",
    description: "text-[var(--danger-foreground)]/80",
    list: "divide-[var(--danger-border)] border-[var(--danger-border)] bg-card",
    itemHover: "hover:bg-[var(--danger-muted)]/60",
    primary: "text-[var(--danger-foreground)]",
    secondary: "text-[var(--danger)]",
  },
}

export function AlertPanel({
  variant,
  title,
  description,
  items,
  footer,
  className,
}: AlertPanelProps) {
  const styles = variantStyles[variant]

  return (
    <Card className={cn(styles.card, className)}>
      <CardHeader className="pb-2">
        <CardTitle className={cn("text-base font-medium", styles.title)}>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {description && (
          <p className={cn("text-sm", styles.description)}>{description}</p>
        )}
        {items.length > 0 && (
          <ul className={cn("divide-y rounded-lg border", styles.list)}>
            {items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm transition-colors duration-200",
                    styles.itemHover
                  )}
                >
                  <span className={cn("font-medium", styles.primary)}>
                    {item.primary}
                  </span>
                  <span className={cn("text-xs", styles.secondary)}>
                    {item.secondary}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {footer}
      </CardContent>
    </Card>
  )
}

/** Inline banner variant for compact alerts */
export function AlertBanner({
  variant,
  children,
  className,
}: {
  variant: "warning" | "danger"
  children: React.ReactNode
  className?: string
}) {
  const styles = variantStyles[variant]
  return (
    <p
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        styles.card,
        styles.description,
        className
      )}
    >
      {children}
    </p>
  )
}
