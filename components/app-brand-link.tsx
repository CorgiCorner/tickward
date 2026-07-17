import { TimerIcon } from "lucide-react"
import Link from "next/link"

import { formatMessage } from "@/lib/i18n/messages"

export function AppBrandLink() {
  return (
    <Link
      href="/"
      aria-label={formatMessage("header.goHome")}
      className="flex items-center gap-1 truncate text-sm font-semibold tracking-tight"
    >
      <TimerIcon className="size-4 shrink-0" strokeWidth={2.5} />
      tickward
    </Link>
  )
}
