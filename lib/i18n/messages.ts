import { getActiveLocale } from "@/lib/i18n/active-locale"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config"
import { enMessages } from "@/lib/i18n/locales/en"
import { plMessages } from "@/lib/i18n/locales/pl"

export { DEFAULT_LOCALE, isSupportedLocale, localeHref, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config"

// Every supported locale must provide a full catalog; the Record type makes a
// missing locale or a missing key a compile error.
export const MESSAGES: Record<Locale, Record<keyof typeof enMessages, string>> = {
  en: enMessages,
  pl: plMessages,
}

export type MessageKey = keyof typeof enMessages
export type MessageParams = Record<string, boolean | null | number | string | undefined>

export function formatMessage(key: MessageKey, params: MessageParams = {}, locale: Locale = getActiveLocale()): string {
  const template = String(MESSAGES[locale]?.[key] ?? MESSAGES[DEFAULT_LOCALE][key])
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined || value === null ? match : String(value)
  })
}

// Plural-aware lookup: picks <keyBase>.<CLDR category> with a fallback to
// .many, so locales with richer plural rules resolve correctly. Dynamic key
// references: timer.count.one / timer.count.few / timer.count.many.
export function formatPluralMessage(
  keyBase: string,
  count: number,
  params: MessageParams = {},
  locale: Locale = getActiveLocale(),
): string {
  const category = new Intl.PluralRules(locale).select(count)
  const candidate = `${keyBase}.${category}`
  const key = (candidate in MESSAGES[DEFAULT_LOCALE] ? candidate : `${keyBase}.many`) as MessageKey
  return formatMessage(key, { count, ...params }, locale)
}
