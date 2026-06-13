import type { ReactNode } from "react"

import { MarketingHeader } from "@/components/marketing-header"
import { SiteFooter } from "@/components/site-footer"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/messages"
import { cn } from "@/lib/utils"

// Shared shell for the content/marketing pages (calendars, use cases, press):
// the marketing header, a single consistent content column, and the global
// site footer. Keeping one width here means these pages always read the same
// regardless of how rich their content is.
export function MarketingPageShell(
  props: Readonly<{
    children: ReactNode
    locale?: Locale
    localeAlternates?: Partial<Record<Locale, string>>
    mainClassName?: string
  }>,
) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <MarketingHeader />
      <main
        className={cn("mx-auto grid w-full max-w-[640px] flex-1 content-start gap-10 px-4 py-10", props.mainClassName)}
      >
        {props.children}
      </main>
      <SiteFooter locale={props.locale ?? DEFAULT_LOCALE} localeAlternates={props.localeAlternates} />
    </div>
  )
}
