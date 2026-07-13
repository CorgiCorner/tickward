import { cache } from "react"

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config"

// Ambient locale for formatMessage callers that do not thread a locale
// explicitly.
//
// Server Components: React's cache() memoizes per request render, so the
// store below is request-scoped and concurrent requests in different locales
// cannot leak into each other. Localized route trees seed it at the top of
// their render (layout, page, generateMetadata).
//
// Client Components: cache() does not memoize, so the request store stays
// empty and the module-level value applies. A document renders in exactly
// one locale and LocaleProvider seeds the value before any descendant reads
// it, both in the browser and during the SSR pass of the client graph.
const requestLocaleStore = cache((): { locale: Locale | undefined } => ({ locale: undefined }))

let moduleLocale: Locale = DEFAULT_LOCALE

export function setActiveLocale(locale: Locale) {
  try {
    requestLocaleStore().locale = locale
  } catch {
    // Outside a React render there is no request store; the module value
    // below still applies.
  }
  moduleLocale = locale
}

export function getActiveLocale(): Locale {
  try {
    // When cache() memoizes (Server Components), the store is request-scoped:
    // never fall back to the module value there, because another request may
    // have written it. An unseeded request renders the default locale.
    const currentStore = requestLocaleStore()
    const repeatedStore = requestLocaleStore()
    if (currentStore === repeatedStore) {
      return currentStore.locale ?? DEFAULT_LOCALE
    }
  } catch {
    // Outside a React render fall through to the module value.
  }
  return moduleLocale
}
