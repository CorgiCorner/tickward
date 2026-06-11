import { formatMessage } from "@/lib/i18n/messages"

export function formatSettingsDate(value: string | null) {
  if (!value) return formatMessage("apiKeys.never")
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

export function SettingsDateMetadata(props: Readonly<{ label: string; value: string | null }>) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-baseline gap-1 whitespace-nowrap">
      <span className="shrink-0">{props.label}:</span>
      <span className="min-w-0 truncate text-foreground/80">{formatSettingsDate(props.value)}</span>
    </span>
  )
}
