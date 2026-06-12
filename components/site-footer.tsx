import { FooterFull } from "@/components/footer-full"
import { appExtensions } from "@/lib/app-extensions"
import { getDocsHref } from "@/lib/docs-config"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/messages"
import { getPublicReleaseTag } from "@/lib/release.server"

// Server-rendered page-level site footer. It is the page-level contentinfo
// landmark; the slim app footer inside the client shell is scoped away from
// the landmark tree.
export function SiteFooter(
  props: Readonly<{ locale?: Locale; localeAlternates?: Partial<Record<Locale, string>> }> = {},
) {
  return (
    <FooterFull
      docsHref={getDocsHref()}
      releaseTag={getPublicReleaseTag()}
      locale={props.locale ?? DEFAULT_LOCALE}
      localeAlternates={props.localeAlternates}
      marketingLinks={appExtensions.marketingFooterLinks?.() ?? []}
    />
  )
}
