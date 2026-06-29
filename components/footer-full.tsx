import Link from "next/link"

import { FooterStatusDot } from "@/components/footer-status-dot"
import { LocaleSwitcher } from "@/components/locale-switcher"
import type { MarketingFooterLink, MarketingFooterSection } from "@/lib/app-extension-points"
import { appExtensions } from "@/lib/app-extensions"
import { DEFAULT_LOCALE, formatMessage, localeHref, type Locale } from "@/lib/i18n/messages"
import { STATUS_PAGE_URL } from "@/lib/status-summary"
import { cn } from "@/lib/utils"

const GITHUB_REPO_URL = "https://github.com/CorgiCorner/tickward"

function FooterColumnHeading(props: Readonly<{ children: string }>) {
  return (
    <h2 className="text-[11px] font-semibold uppercase leading-none tracking-[0.1em] text-muted-foreground">
      {props.children}
    </h2>
  )
}

const FOOTER_LINK_CLASS = "text-sm leading-relaxed text-muted-foreground hover:text-foreground"
const FOOTER_ENTRIES_LIMIT = 12

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

// The footer surfaces a sample of ready-made calendars: global (no-country)
// ones first, then per-country ones, sorted within each band and capped at
// FOOTER_ENTRIES_LIMIT, plus the umbrella link to the full index. The richer
// per-country breakdown still lives in the homepage CountryCalendarsSection.
// Renders nothing when there are no links (e.g. the public mirror has none).
function FooterEntriesColumn(props: Readonly<{ locale: Locale; marketingLinks?: MarketingFooterLink[] }>) {
  const sorted = (props.marketingLinks ?? []).slice().sort((a, b) => a.label.localeCompare(b.label, props.locale))
  const globalLinks = [...sorted.filter((link) => !link.country), ...sorted.filter((link) => link.country)].slice(
    0,
    FOOTER_ENTRIES_LIMIT,
  )
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
        <li>
          <a
            className={cn(FOOTER_LINK_CLASS, "inline-flex items-center gap-1.5")}
            href={STATUS_PAGE_URL}
            target="_blank"
            rel="noreferrer"
          >
            <FooterStatusDot />
            {formatMessage("footer.status", {}, props.locale)}
          </a>
        </li>
      </ul>
    </nav>
  )
}

function FooterCopyright(props: Readonly<{ locale: Locale }>) {
  const year = new Date().getFullYear()

  return (
    <div className="text-xs leading-none text-muted-foreground/70">
      <span>{formatMessage("app.browserTitle.default", {}, props.locale)}</span>{" "}
      <span>{formatMessage("footer.copyrightYear", { year }, props.locale)}</span>
    </div>
  )
}

function ReleaseTagBadge(props: Readonly<{ releaseTag: string }>) {
  return (
    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
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
    <footer className={cn("border-t border-border bg-background", className)}>
      <div className="mx-auto w-full max-w-[640px] px-4 py-12 text-xs text-muted-foreground">
        <div className="grid gap-8 sm:grid-cols-2">
          <FooterMarketingSections sections={marketingSections} />
          <FooterEntriesColumn locale={locale} marketingLinks={marketingLinks} />
          <FooterProductColumn docsHref={docsHref} locale={locale} />
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[640px] flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground">
          <p className="leading-relaxed">{formatMessage("footer.inactivityPolicy", {}, locale)}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
