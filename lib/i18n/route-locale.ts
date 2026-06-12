import { setActiveLocale } from "@/lib/i18n/active-locale"
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/config"

// Resolves the [locale] route param for pages and generateMetadata and seeds
// the ambient request locale. Unsupported values fall back to the default
// locale; the [locale] layout owns the 404 for them.
export async function resolveRouteLocale(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params
  const resolved = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE
  setActiveLocale(resolved)
  return resolved
}
