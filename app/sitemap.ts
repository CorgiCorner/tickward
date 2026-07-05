import type { MetadataRoute } from "next"
import { appExtensions } from "@/lib/app-extensions"
import { getDocsSitemapPaths } from "@/lib/docs-config"
import { DEFAULT_LOCALE, localeHref, SUPPORTED_LOCALES } from "@/lib/i18n/config"
import { getSiteOrigin } from "@/lib/site-config"

const APP_SITEMAP_ENTRIES = [
  {
    path: "/",
    changeFrequency: "weekly",
    priority: 1,
    // The home page is a true translation pair; locale-native pages and the
    // EN-only chrome routes are listed once, in their own language.
    localized: true,
  },
  {
    path: "/press",
    changeFrequency: "monthly",
    priority: 0.5,
    localized: true,
  },
] as const

type SitemapSource = Readonly<{
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]
  path: string
  priority: number
  localized?: boolean
}>

function sitemapUrl(siteOrigin: string, href: string): string {
  return href === "/" ? siteOrigin : `${siteOrigin}${href}`
}

function localeAlternates(siteOrigin: string, path: string) {
  return {
    languages: {
      ...Object.fromEntries(
        SUPPORTED_LOCALES.map((locale) => [locale, sitemapUrl(siteOrigin, localeHref(locale, path))]),
      ),
      "x-default": sitemapUrl(siteOrigin, localeHref(DEFAULT_LOCALE, path)),
    },
  }
}

function sitemapEntries(siteOrigin: string, entry: SitemapSource): MetadataRoute.Sitemap {
  if (!entry.localized) {
    return [
      {
        url: sitemapUrl(siteOrigin, entry.path),
        changeFrequency: entry.changeFrequency,
        priority: entry.priority,
      },
    ]
  }

  return SUPPORTED_LOCALES.map((locale) => ({
    url: sitemapUrl(siteOrigin, localeHref(locale, entry.path)),
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
    alternates: localeAlternates(siteOrigin, entry.path),
  }))
}

export default function sitemap(): MetadataRoute.Sitemap {
  const siteOrigin = getSiteOrigin()
  const docsEntries = getDocsSitemapPaths().map((path) => ({
    path,
    changeFrequency: "monthly" as const,
    priority: path === localeHref(DEFAULT_LOCALE, "/docs") ? 0.7 : 0.6,
  }))
  const marketingEntries = appExtensions.marketingSitemapEntries?.() ?? []

  return [...APP_SITEMAP_ENTRIES, ...docsEntries, ...marketingEntries].flatMap((entry) =>
    sitemapEntries(siteOrigin, entry),
  )
}
