import Link from "next/link"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface KpiCardProps {
  title: string
  value: string | number
  description: string
  highlight?: boolean
  href?: string | null
}

export function KpiCard({
  title,
  value,
  description,
  highlight = false,
  href = null,
}: KpiCardProps) {
  const inner = (
    <Card
      className={cn(
        "transition-all duration-200",
        highlight && "border-l-4 border-l-[var(--highlight)] border-border",
        href && "hover:shadow-md cursor-pointer"
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-sans font-medium tracking-wider text-muted-foreground uppercase">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-heading text-3xl font-medium tracking-tight text-foreground">
          {value}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  )

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    )
  }

  return inner
}
