import { enMessages } from "@/lib/i18n/locales/en"

export const DEFAULT_LOCALE = "en"

export const MESSAGES = {
  en: enMessages,
} as const

export type Locale = keyof typeof MESSAGES
export type MessageKey = keyof (typeof MESSAGES)[typeof DEFAULT_LOCALE]
export type MessageParams = Record<string, boolean | null | number | string | undefined>

export function formatMessage(key: MessageKey, params: MessageParams = {}, locale: Locale = DEFAULT_LOCALE): string {
  const template = String(MESSAGES[locale]?.[key] ?? MESSAGES[DEFAULT_LOCALE][key])
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined || value === null ? match : String(value)
  })
}
