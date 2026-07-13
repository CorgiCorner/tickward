import Link from "next/link"

import { appExtensions } from "@/lib/app-extensions"
import { formatMessage, localeHref, type Locale } from "@/lib/i18n/messages"

// Cross-locale discovery band shown above the footer on the homepage: every
// country's ready-made calendars, grouped by country regardless of the
// visitor's own locale, so anyone can spot a country category and step into it.
// Data flows through the app-extensions point, so the public mirror (empty
// override) renders nothing.
// Each country card is capped so the 2x2 grid stays visually even; the country
// heading links to that country's section on the full /timers index.
const COUNTRY_LINK_LIMIT = 6

// Every country code that has an inline flag below; codes outside the set
// render no flag at all, so keep this in sync when adding a country.
const FLAG_CODES = new Set(["PL", "GB", "US", "CA", "DE", "AU"])

function normalizeFlagCode(code: string) {
  const normalized = code.toUpperCase()
  if (normalized === "UK") return "GB"
  return FLAG_CODES.has(normalized) ? normalized : null
}

function CountryFlag(props: Readonly<{ code: string }>) {
  const flagCode = normalizeFlagCode(props.code)
  if (!flagCode) return null

  return (
    <span
      aria-hidden="true"
      className="inline-flex h-3.5 w-5 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-black/10"
    >
      {flagCode === "PL" ? (
        <svg viewBox="0 0 20 14" className="h-full w-full">
          <rect width="20" height="7" fill="#fff" />
          <rect y="7" width="20" height="7" fill="#dc143c" />
        </svg>
      ) : null}
      {flagCode === "GB" ? (
        <svg viewBox="0 0 20 14" className="h-full w-full">
          <rect width="20" height="14" fill="#012169" />
          <path d="M0,0 L20,14 M20,0 L0,14" stroke="#fff" strokeWidth="3" />
          <path d="M0,0 L20,14 M20,0 L0,14" stroke="#C8102E" strokeWidth="1.5" />
          <rect x="8" width="4" height="14" fill="#fff" />
          <rect y="5" width="20" height="4" fill="#fff" />
          <rect x="9" width="2" height="14" fill="#C8102E" />
          <rect y="6" width="20" height="2" fill="#C8102E" />
        </svg>
      ) : null}
      {flagCode === "US" ? (
        <svg viewBox="0 0 20 14" className="h-full w-full">
          <rect width="20" height="14" fill="#fff" />
          <g fill="#B22234">
            <rect y="0" width="20" height="2" />
            <rect y="4" width="20" height="2" />
            <rect y="8" width="20" height="2" />
            <rect y="12" width="20" height="2" />
          </g>
          <rect width="9" height="8" fill="#3C3B6E" />
        </svg>
      ) : null}
      {flagCode === "DE" ? (
        <svg viewBox="0 0 20 14" className="h-full w-full">
          <rect width="20" height="4.67" fill="#000" />
          <rect y="4.67" width="20" height="4.66" fill="#DD0000" />
          <rect y="9.33" width="20" height="4.67" fill="#FFCE00" />
        </svg>
      ) : null}
      {flagCode === "AU" ? (
        <svg viewBox="0 0 20 14" className="h-full w-full">
          <rect width="20" height="14" fill="#012169" />
          <g transform="scale(0.5)">
            <path d="M0,0 L20,14 M20,0 L0,14" stroke="#fff" strokeWidth="3" />
            <path d="M0,0 L20,14 M20,0 L0,14" stroke="#C8102E" strokeWidth="1.5" />
            <rect x="8" width="4" height="14" fill="#fff" />
            <rect y="5" width="20" height="4" fill="#fff" />
            <rect x="9" width="2" height="14" fill="#C8102E" />
            <rect y="6" width="20" height="2" fill="#C8102E" />
          </g>
          <g fill="#fff">
            <circle cx="5" cy="10.8" r="1.1" />
            <circle cx="14.5" cy="3" r="0.8" />
            <circle cx="17.5" cy="5.5" r="0.8" />
            <circle cx="14" cy="8.2" r="0.8" />
            <circle cx="16.5" cy="11.2" r="0.8" />
          </g>
        </svg>
      ) : null}
      {flagCode === "CA" ? (
        <svg viewBox="0 0 20 14" className="h-full w-full">
          <rect width="20" height="14" fill="#fff" />
          <rect width="5" height="14" fill="#FF0000" />
          <rect x="15" width="5" height="14" fill="#FF0000" />
          <path
            fill="#FF0000"
            d="M10 4 l0.5 1.5 1.5-0.3-0.6 1.3 1 0.2-0.9 0.8 0.3 0.5-1.4 0.2 0.2 1.7-0.6-0.6-0.6 0.6 0.2-1.7-1.4-0.2 0.3-0.5-0.9-0.8 1-0.2-0.6-1.3 1.5 0.3z"
          />
        </svg>
      ) : null}
    </span>
  )
}

export function CountryCalendarsSection(props: Readonly<{ locale: Locale }>) {
  const groups = appExtensions.marketingCountryCalendars?.(props.locale) ?? []
  if (groups.length === 0) return null

  return (
    <section
      aria-label={formatMessage("entry.byCountryHeading", {}, props.locale)}
      className="border-t border-border bg-secondary"
    >
      <div className="mx-auto w-full max-w-[640px] px-4 py-12">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {formatMessage("entry.byCountryHeading", {}, props.locale)}
        </h2>
        <div className="mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {groups.map((group) => (
            <nav key={group.code} aria-label={group.countryLabel} className="grid content-start gap-2">
              <h3 className="text-xs font-medium leading-none text-foreground">
                <Link
                  className="inline-flex items-center gap-2 hover:text-foreground hover:underline"
                  href={`${localeHref(props.locale, "/timers")}#country-${group.code}`}
                >
                  <CountryFlag code={group.code} />
                  <span>{group.countryLabel}</span>
                </Link>
              </h3>
              <ul className="grid gap-1.5">
                {group.links.slice(0, COUNTRY_LINK_LIMIT).map((link) => (
                  <li key={link.href}>
                    <Link
                      className="text-sm leading-relaxed text-muted-foreground hover:text-foreground hover:underline"
                      href={link.href}
                      hrefLang={link.hrefLang}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <Link
          className="text-sm font-medium text-foreground hover:underline"
          href={localeHref(props.locale, "/timers")}
        >
          {formatMessage("entry.indexAll", {}, props.locale)}
        </Link>
      </div>
    </section>
  )
}
