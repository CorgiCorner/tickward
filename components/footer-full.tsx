import Link from "next/link"

import { LocaleSwitcher } from "@/components/locale-switcher"
import type { MarketingFooterLink, MarketingFooterSection } from "@/lib/app-extension-points"
import { appExtensions } from "@/lib/app-extensions"
import { DEFAULT_LOCALE, formatMessage, localeHref, type Locale } from "@/lib/i18n/messages"
import { cn } from "@/lib/utils"

const GITHUB_REPO_URL = "https://github.com/CorgiCorner/tickward"

function FooterColumnHeading(props: Readonly<{ children: string }>) {
  return (
    <h2 className="text-[10px] font-medium uppercase leading-none tracking-wide text-muted-foreground/70">
      {props.children}
    </h2>
  )
}

const FOOTER_LINK_CLASS = "text-[11px] leading-relaxed text-muted-foreground/80 hover:text-foreground"
const FOOTER_ENTRIES_LIMIT = 15

function FooterMarketingSections(props: Readonly<{ sections: readonly MarketingFooterSection[] }>) {
  if (props.sections.length === 0) return null

  return (
    <>
      {props.sections.map((section) => (
        <nav
          key={section.ariaLabel}
          aria-label={section.ariaLabel}
          className="grid min-w-[140px] content-start gap-2.5"
        >
          <FooterColumnHeading>{section.heading}</FooterColumnHeading>
          <ul className="grid gap-1.5">
            {section.links.map((link) => (
              <li key={link.href}>
                <Link className={FOOTER_LINK_CLASS} href={link.href} hrefLang={link.hrefLang}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ))}
    </>
  )
}

// The footer now surfaces only the GLOBAL (no-country) calendars as examples,
// regardless of locale, plus the umbrella link to the full index. Per-country
// calendars live in the homepage CountryCalendarsSection instead. Renders
// nothing when there are no global links (e.g. the public mirror has none).
function FooterEntriesColumn(props: Readonly<{ locale: Locale; marketingLinks?: MarketingFooterLink[] }>) {
  const globalLinks = (props.marketingLinks ?? [])
    .filter((link) => !link.country)
    .sort((a, b) => a.label.localeCompare(b.label, props.locale))
    .slice(0, FOOTER_ENTRIES_LIMIT)
  if (globalLinks.length === 0) return null

  return (
    <nav
      aria-label={formatMessage("entry.indexTitle", {}, props.locale)}
      className="grid min-w-[140px] content-start gap-2.5"
    >
      <FooterColumnHeading>{formatMessage("entry.indexTitle", {}, props.locale)}</FooterColumnHeading>
      <ul className="grid gap-1.5">
        {globalLinks.map((link) => (
          <li key={link.href}>
            <Link className={FOOTER_LINK_CLASS} href={link.href} hrefLang={link.hrefLang}>
              {link.label}
            </Link>
          </li>
        ))}
        <li>
          <Link className={FOOTER_LINK_CLASS} href={localeHref(props.locale, "/timers")}>
            {formatMessage("entry.indexAll", {}, props.locale)}
          </Link>
        </li>
      </ul>
    </nav>
  )
}

function FooterProductColumn(props: Readonly<{ docsHref?: string | null; locale: Locale }>) {
  return (
    <nav aria-label="tickward" className="grid min-w-[140px] content-start gap-2.5">
      <FooterColumnHeading>tickward</FooterColumnHeading>
      <ul className="grid gap-1.5">
        {props.docsHref ? (
          <li>
            <Link className={FOOTER_LINK_CLASS} href={props.docsHref}>
              {formatMessage("footer.docs", {}, props.locale)}
            </Link>
          </li>
        ) : null}
        <li>
          <a className={FOOTER_LINK_CLASS} href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
            {formatMessage("footer.github", {}, props.locale)}
          </a>
        </li>
        <li>
          <Link className={FOOTER_LINK_CLASS} href={localeHref(props.locale, "/press")}>
            {formatMessage("footer.press", {}, props.locale)}
          </Link>
        </li>
      </ul>
    </nav>
  )
}

function FooterCopyright(props: Readonly<{ locale: Locale }>) {
  const year = new Date().getFullYear()

  return (
    <div className="text-[11px] leading-none text-muted-foreground/70">
      <span>{formatMessage("app.browserTitle.default", {}, props.locale)}</span>{" "}
      <span>{formatMessage("footer.copyrightYear", { year }, props.locale)}</span>
    </div>
  )
}

function ReleaseTagBadge(props: Readonly<{ releaseTag: string }>) {
  return (
    <span className="shrink-0 rounded-full bg-muted px-2 py-1 font-mono text-[10px] leading-none text-muted-foreground ring-1 ring-border/60">
      {props.releaseTag}
    </span>
  )
}

type FooterFullProps = {
  className?: string
  docsHref?: string | null
  locale?: Locale
  localeAlternates?: Partial<Record<Locale, string>>
  marketingLinks?: MarketingFooterLink[]
  marketingSections?: MarketingFooterSection[]
  releaseTag: string
}

export function FooterFull({
  className,
  docsHref,
  locale = DEFAULT_LOCALE,
  localeAlternates,
  marketingLinks = appExtensions.marketingFooterLinks?.() ?? [],
  marketingSections = appExtensions.marketingFooterSections?.(locale) ?? [],
  releaseTag,
}: Readonly<FooterFullProps>) {
  return (
    <footer className={cn("border-t bg-background", className)}>
      <div className="mx-auto grid w-full max-w-[880px] gap-8 px-5 py-10 text-xs text-muted-foreground">
        <div className="grid grid-cols-2 gap-x-8 gap-y-8 sm:flex sm:flex-wrap sm:gap-x-14">
          <FooterMarketingSections sections={marketingSections} />
          <FooterEntriesColumn locale={locale} marketingLinks={marketingLinks} />
          <FooterProductColumn docsHref={docsHref} locale={locale} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t pt-5">
          <p className="leading-relaxed">{formatMessage("footer.inactivityPolicy", {}, locale)}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <LocaleSwitcher alternates={localeAlternates} />
            <div className="flex items-center gap-2">
              <FooterCopyright locale={locale} />
              <ReleaseTagBadge releaseTag={releaseTag} />
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
