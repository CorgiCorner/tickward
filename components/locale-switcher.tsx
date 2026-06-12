"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { useLocale } from "@/components/locale-provider"
import { localeHref, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

// Language autonyms are intentionally not translated: each label is shown in
// its own language regardless of the page locale.
const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  pl: "Polski",
}

function stripLocalePrefix(pathname: string): string {
  for (const locale of SUPPORTED_LOCALES) {
    if (pathname === `/${locale}`) return "/"
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1)
  }
  return pathname
}

// Switches the site language in place by swapping the locale prefix on the
// current path. Pages that exist in only one language (locale-native entries)
// pass explicit alternates so the other language lands somewhere real.
export function LocaleSwitcher(props: Readonly<{ alternates?: Partial<Record<Locale, string>> }>) {
  const activeLocale = useLocale()
  const pathname = usePathname() ?? "/"
  const barePath = stripLocalePrefix(pathname)

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {SUPPORTED_LOCALES.map((locale) => {
        const isActive = locale === activeLocale
        const href = props.alternates?.[locale] ?? localeHref(locale, barePath)
        return (
          <Link
            key={locale}
            className={cn("hover:text-foreground", isActive && "text-foreground")}
            href={href}
            hrefLang={locale}
            lang={locale}
            aria-current={isActive ? "true" : undefined}
          >
            {LOCALE_LABELS[locale]}
          </Link>
        )
      })}
    </div>
  )
}
