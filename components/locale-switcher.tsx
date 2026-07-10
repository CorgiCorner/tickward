"use client"

import { CheckIcon, Globe2Icon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { useLocale } from "@/components/locale-provider"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { localeHref, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

// Language autonyms are intentionally not translated: each label is shown in
// its own language regardless of the page locale.
const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  pl: "Polski",
  it: "Italiano",
  de: "Deutsch",
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
// Rendered as a dropdown so the footer stays compact as locales are added;
// search engines read language alternates from page metadata, not from these
// menu links.
export function LocaleSwitcher(props: Readonly<{ alternates?: Partial<Record<Locale, string>> }>) {
  const activeLocale = useLocale()
  const pathname = usePathname() ?? "/"
  const barePath = stripLocalePrefix(pathname)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2">
        <Globe2Icon aria-hidden className="size-3.5" />
        {LOCALE_LABELS[activeLocale]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        {SUPPORTED_LOCALES.map((locale) => {
          const isActive = locale === activeLocale
          const href = props.alternates?.[locale] ?? localeHref(locale, barePath)
          return (
            <DropdownMenuItem key={locale} asChild>
              <Link
                className="flex items-center justify-between gap-3"
                href={href}
                hrefLang={locale}
                lang={locale}
                aria-current={isActive ? "true" : undefined}
              >
                {LOCALE_LABELS[locale]}
                <CheckIcon aria-hidden className={cn("size-3.5", !isActive && "invisible")} />
              </Link>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
