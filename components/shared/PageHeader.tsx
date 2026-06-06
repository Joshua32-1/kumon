import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-2 flex items-start justify-between gap-4", className)}>
      <div>
        <h1 className="font-heading text-3xl font-medium tracking-tight text-foreground">
          {title}
        </h1>
        <div className="mt-2 h-px w-10 bg-[var(--highlight)]" />
        {description && (
          <p className="mt-3 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </div>
  )
}
