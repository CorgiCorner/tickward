"use client"

import { createContext, useContext, type ReactNode } from "react"

import { setActiveLocale } from "@/lib/i18n/active-locale"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/messages"

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

// Seeds the ambient locale during render, before any descendant client
// component calls formatMessage. Intentionally a render-time side effect: a
// document renders in exactly one locale, so the module-level value cannot
// disagree with the context below it.
export function LocaleProvider(props: Readonly<{ locale: Locale; children: ReactNode }>) {
  setActiveLocale(props.locale)
  return <LocaleContext.Provider value={props.locale}>{props.children}</LocaleContext.Provider>
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}
