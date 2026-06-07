import type { MetadataRoute } from "next"
import { getSiteOrigin } from "@/lib/site-config"

const DISALLOWED_ROUTES = ["/api/", "/account", "/demo", "/settings", "/sign-in"] as const

export default function robots(): MetadataRoute.Robots {
  const siteOrigin = getSiteOrigin()

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...DISALLOWED_ROUTES],
      },
    ],
    sitemap: `${siteOrigin}/sitemap.xml`,
  }
}
