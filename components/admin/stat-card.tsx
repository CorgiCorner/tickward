import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function StatCard({
  className,
  label,
  subline,
  value,
}: Readonly<{
  className?: string
  label: string
  subline?: string
  value: string
}>) {
  return (
    <Card className={cn("gap-0 py-5", className)}>
      <CardContent className="grid gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums tracking-normal">{value}</p>
        {subline ? <p className="text-xs text-muted-foreground/75">{subline}</p> : null}
      </CardContent>
    </Card>
  )
}
