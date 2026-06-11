import type { MetadataRoute } from "next"
import { getDocsSitemapPaths } from "@/lib/docs-config"
import { getSiteOrigin } from "@/lib/site-config"

const APP_SITEMAP_ENTRIES = [
  {
    path: "/",
    changeFrequency: "weekly",
    priority: 1,
  },
  {
    path: "/press",
    changeFrequency: "monthly",
    priority: 0.5,
  },
] as const

function sitemapEntry(
  siteOrigin: string,
  entry: Readonly<{
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]
    path: string
    priority: number
  }>,
) {
  return {
    url: `${siteOrigin}${entry.path}`,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const siteOrigin = getSiteOrigin()
  const docsEntries = getDocsSitemapPaths().map((path) => ({
    path,
    changeFrequency: "monthly" as const,
    priority: path === "/docs" ? 0.7 : 0.6,
  }))

  return [...APP_SITEMAP_ENTRIES, ...docsEntries].map((entry) => sitemapEntry(siteOrigin, entry))
}
