import { getSiteOrigin } from "@/lib/site-config"

export const ROBOTS_DISALLOWED_ROUTES = ["/api/", "/account", "/demo", "/settings", "/sign-in"] as const

// Content usage preferences for AI and search crawlers (https://contentsignals.org).
//   search    = yes  -> may be indexed for search, including AI-powered search
//   ai-input  = yes  -> may be used as live input for AI answers (grounding/RAG)
//   ai-train  = no   -> must not be used to train AI/ML models
export const CONTENT_SIGNAL = "search=yes, ai-input=yes, ai-train=no"

export function buildRobotsTxt(siteOrigin: string = getSiteOrigin()): string {
  return [
    "# Content usage preferences for AI and search crawlers. See https://contentsignals.org",
    "User-Agent: *",
    `Content-Signal: ${CONTENT_SIGNAL}`,
    "Allow: /",
    ...ROBOTS_DISALLOWED_ROUTES.map((route) => `Disallow: ${route}`),
    "",
    `Sitemap: ${siteOrigin}/sitemap.xml`,
    "",
  ].join("\n")
}
