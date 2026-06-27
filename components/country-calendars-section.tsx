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

export function CountryCalendarsSection(props: Readonly<{ locale: Locale }>) {
  const groups = appExtensions.marketingCountryCalendars?.(props.locale) ?? []
  if (groups.length === 0) return null

  return (
    <section aria-label={formatMessage("entry.byCountryHeading", {}, props.locale)} className="border-t bg-muted/20">
      <div className="mx-auto grid w-full max-w-[880px] gap-6 px-5 py-12">
        <h2 className="text-xs font-semibold tracking-normal text-foreground">
          {formatMessage("entry.byCountryHeading", {}, props.locale)}
        </h2>
        <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {groups.map((group) => (
            <nav key={group.code} aria-label={group.countryLabel} className="grid content-start gap-2">
              <h3 className="text-xs font-medium uppercase leading-none tracking-wide text-muted-foreground/70">
                <Link
                  className="hover:text-foreground hover:underline"
                  href={`${localeHref(props.locale, "/timers")}#country-${group.code}`}
                >
                  {group.countryLabel}
                </Link>
              </h3>
              <ul className="grid gap-1.5">
                {group.links.slice(0, COUNTRY_LINK_LIMIT).map((link) => (
                  <li key={link.href}>
                    <Link
                      className="text-xs leading-relaxed text-muted-foreground hover:text-foreground hover:underline"
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
          className="text-xs font-medium text-foreground hover:underline"
          href={localeHref(props.locale, "/timers")}
        >
          {formatMessage("entry.indexAll", {}, props.locale)}
        </Link>
      </div>
    </section>
  )
}
