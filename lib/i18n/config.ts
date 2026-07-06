// Locale registry kept free of catalog imports so the proxy (middleware) can
// use it without bundling every message catalog.
export const SUPPORTED_LOCALES = ["en", "pl", "it"] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "en"

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

// The default locale uses the bare path only for the homepage. Every other
// public page route carries an explicit /<locale> prefix.
export function localeHref(locale: Locale, path: string): string {
  if (locale === DEFAULT_LOCALE && path === "/") return "/"
  return path === "/" ? `/${locale}` : `/${locale}${path}`
}

const OG_LOCALES: Record<Locale, string> = {
  en: "en_US",
  pl: "pl_PL",
  it: "it_IT",
}

export function ogLocale(locale: Locale): string {
  return OG_LOCALES[locale]
}
